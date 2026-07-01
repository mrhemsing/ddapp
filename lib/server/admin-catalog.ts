import { readFile } from "node:fs/promises";
import path from "node:path";
import { AdminStopStatus, OrderProposalStatus, type Prisma } from "@prisma/client";
import { fakeRoute, type RoutePack } from "@/lib/route-data";
import { prisma } from "@/lib/server/prisma";
import { buildOrderProposal } from "@/lib/server/admin-ordering";

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function ensureCatalogSeed() {
  const operatorLoopIds = new Set([
    "campus-after-dark",
    "west-side-dead-drive",
    "edge-of-town",
    "nutana-broadway"
  ]);
  const existingOperatorTours = await prisma.adminTour.count({
    where: { slug: { in: [...operatorLoopIds] } }
  });
  if (existingOperatorTours === operatorLoopIds.size) {
    return;
  }

  const route = await loadSeedRoutePack();
  const stopMap = new Map(route.stops.map((stop) => [stop.id, stop]));
  const loops = (route.loops ?? [])
    .filter((loop) => operatorLoopIds.has(loop.id))
    .sort((a, b) => [...operatorLoopIds].indexOf(a.id) - [...operatorLoopIds].indexOf(b.id));

  await prisma.$transaction(async (tx) => {
    await tx.adminTour.deleteMany({ where: { slug: fakeRoute.id } });

    for (const stop of route.stops) {
      await tx.adminStop.upsert({
        where: { slug: stop.id },
        update: {
          name: stop.title,
          address: stop.parkPoint?.label,
          lat: stop.parkPoint?.lat ?? stop.lat,
          lng: stop.parkPoint?.lng ?? stop.lng,
          narrationScript: stop.audio.reviewScript ?? stop.story.body,
          safetyWarning: stop.safetyNote ?? "Review safety guidance before publishing.",
          status: AdminStopStatus.live
        },
        create: {
          slug: stop.id,
          name: stop.title,
          address: stop.parkPoint?.label,
          lat: stop.parkPoint?.lat ?? stop.lat,
          lng: stop.parkPoint?.lng ?? stop.lng,
          narrationScript: stop.audio.reviewScript ?? stop.story.body,
          safetyWarning: stop.safetyNote ?? "Review safety guidance before publishing.",
          themeTags: [],
          status: AdminStopStatus.live
        }
      });
    }

    for (const loop of loops) {
      const tour = await tx.adminTour.upsert({
        where: { slug: loop.id },
        update: {
          title: loop.title,
          targetDurationMinutes: parseEstimatedMinutes(loop.estimatedDuration)
        },
        create: {
          slug: loop.id,
          title: loop.title,
          targetDurationMinutes: parseEstimatedMinutes(loop.estimatedDuration)
        }
      });

      await tx.tourStop.deleteMany({ where: { tourId: tour.id } });

      for (const [index, stopId] of loop.stopIds.entries()) {
        const stop = stopMap.get(stopId);
        const adminStop = await tx.adminStop.findUnique({ where: { slug: stopId } });
        if (!stop || !adminStop) {
          continue;
        }

        const leg = loop.legs?.find((item) => item.fromStopId === stopId);
        await tx.tourStop.create({
          data: {
            tourId: tour.id,
            stopId: adminStop.id,
            position: index + 1,
            isStart: index === 0,
            isFinale: index === loop.stopIds.length - 1,
            narrationAudio: stop.audio.narrationFile,
            driveToNextAudio: leg?.audioFile ?? stop.driveToNextAudio,
            audioStatus: "ready"
          }
        });
      }
    }
  });
}

const localRoutePackPath = path.join(process.cwd(), "private", "dark-drives-route-pack.json");

async function loadSeedRoutePack(): Promise<RoutePack> {
  const rawJson = process.env.DARK_DRIVES_ROUTE_PACK_JSON;
  const rawBase64 = process.env.DARK_DRIVES_ROUTE_PACK_B64;
  const payload = rawJson ?? (rawBase64 ? Buffer.from(rawBase64, "base64").toString("utf8") : "");

  if (payload) {
    return JSON.parse(payload) as RoutePack;
  }

  try {
    return JSON.parse(await readFile(localRoutePackPath, "utf8")) as RoutePack;
  } catch {
    return fakeRoute;
  }
}

function parseEstimatedMinutes(value: string) {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 70;
}

export async function getAdminDashboardData() {
  await ensureCatalogSeed();

  const [tours, stops, proposals] = await Promise.all([
    prisma.adminTour.findMany({
      orderBy: { title: "asc" },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { stop: true }
        }
      }
    }),
    prisma.adminStop.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        tourStops: {
          include: { tour: true },
          orderBy: { position: "asc" }
        }
      }
    }),
    prisma.orderProposal.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { tour: true }
    })
  ]);

  return { tours, stops, proposals };
}

async function geocodeAddress(address: string) {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) {
    return null;
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set("access_token", mapboxToken);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "CA");
  url.searchParams.set("proximity", "-106.67,52.13");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = payload.features?.[0]?.center;
  if (!center) {
    return null;
  }

  return { lng: center[0], lat: center[1] };
}

export async function createStop(input: {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  narrationScript: string;
  safetyWarning: string;
  themeTags?: string[] | string;
  status?: AdminStopStatus;
  tourId?: string;
  isStart?: boolean;
  isFinale?: boolean;
  narrationAudio?: string;
  driveToNextAudio?: string;
}) {
  const geocoded = input.address ? await geocodeAddress(input.address) : null;
  const lat = input.lat ?? geocoded?.lat;
  const lng = input.lng ?? geocoded?.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Coordinates are required until a routing provider geocoder is configured.");
  }

  return prisma.$transaction(async (tx) => {
    const stop = await tx.adminStop.create({
      data: {
        slug: slugify(input.name),
        name: input.name.trim(),
        address: input.address?.trim(),
        lat,
        lng,
        narrationScript: input.narrationScript.trim(),
        safetyWarning: input.safetyWarning.trim(),
        themeTags: parseTags(input.themeTags),
        status: input.status ?? AdminStopStatus.held
      }
    });

    if (input.tourId) {
      const last = await tx.tourStop.findFirst({
        where: { tourId: input.tourId },
        orderBy: { position: "desc" }
      });

      await tx.tourStop.create({
        data: {
          tourId: input.tourId,
          stopId: stop.id,
          position: (last?.position ?? 0) + 1,
          isStart: Boolean(input.isStart),
          isFinale: Boolean(input.isFinale),
          narrationAudio: input.narrationAudio?.trim() || null,
          driveToNextAudio: input.driveToNextAudio?.trim() || null,
          audioStatus: "needs_generation"
        }
      });
    }

    return stop;
  });
}

export async function updateStop(input: {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  narrationScript: string;
  safetyWarning: string;
  themeTags?: string[] | string;
  status: AdminStopStatus;
}) {
  return prisma.adminStop.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      address: input.address?.trim(),
      lat: input.lat,
      lng: input.lng,
      narrationScript: input.narrationScript.trim(),
      safetyWarning: input.safetyWarning.trim(),
      themeTags: parseTags(input.themeTags),
      status: input.status
    }
  });
}

export async function updateTour(input: {
  id: string;
  title: string;
  targetDurationMinutes: number;
}) {
  return prisma.adminTour.update({
    where: { id: input.id },
    data: {
      title: input.title.trim(),
      targetDurationMinutes: input.targetDurationMinutes
    }
  });
}

export async function createTour(input: {
  title: string;
  targetDurationMinutes: number;
}) {
  const title = input.title.trim() || "Untitled Tour";
  return prisma.adminTour.create({
    data: {
      slug: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      targetDurationMinutes: input.targetDurationMinutes
    }
  });
}

export async function removeTour(id: string) {
  await prisma.adminTour.delete({ where: { id } });
}

export async function updateTourStop(input: {
  membershipId: string;
  position: number;
  isStart: boolean;
  isFinale: boolean;
  narrationAudio?: string;
  driveToNextAudio?: string;
  audioStatus?: string;
}) {
  return prisma.tourStop.update({
    where: { id: input.membershipId },
    data: {
      position: input.position,
      isStart: input.isStart,
      isFinale: input.isFinale,
      narrationAudio: input.narrationAudio?.trim() || null,
      driveToNextAudio: input.driveToNextAudio?.trim() || null,
      audioStatus: input.audioStatus || "needs_generation"
    }
  });
}

export async function addStopToTour(input: {
  tourId: string;
  stopId: string;
  narrationAudio?: string;
}) {
  const last = await prisma.tourStop.findFirst({
    where: { tourId: input.tourId },
    orderBy: { position: "desc" }
  });

  return prisma.tourStop.create({
    data: {
      tourId: input.tourId,
      stopId: input.stopId,
      position: (last?.position ?? 0) + 1,
      narrationAudio: input.narrationAudio?.trim() || null,
      audioStatus: "needs_generation"
    }
  });
}

export async function removeStopFromTour(membershipId: string) {
  await prisma.tourStop.delete({ where: { id: membershipId } });
}

export async function markTourAudioQueued(tourId: string) {
  await prisma.tourStop.updateMany({
    where: { tourId },
    data: { audioStatus: "queued" }
  });
}

export async function removeStop(id: string) {
  await prisma.adminStop.delete({ where: { id } });
}

export async function createOrderProposal(input: { tourId: string; trigger: string; actor: string }) {
  const tour = await prisma.adminTour.findUnique({
    where: { id: input.tourId },
    include: {
      stops: {
        orderBy: { position: "asc" },
        include: { stop: true }
      }
    }
  });

  if (!tour) {
    throw new Error("Tour not found.");
  }

  const proposal = buildOrderProposal(tour, input.trigger);
  return prisma.orderProposal.create({
    data: {
      tourId: tour.id,
      trigger: input.trigger,
      currentOrder: proposal.currentOrder as Prisma.InputJsonValue,
      proposedOrder: proposal.proposedOrder as Prisma.InputJsonValue,
      placementReasons: proposal.placementReasons as Prisma.InputJsonValue,
      invalidatedLegs: proposal.invalidatedLegs as Prisma.InputJsonValue,
      issues: proposal.issues as Prisma.InputJsonValue,
      engineSummary: proposal.engineSummary,
      durationMinutes: proposal.durationMinutes,
      targetDurationMinutes: proposal.targetDurationMinutes,
      durationDeltaMinutes: proposal.durationDeltaMinutes,
      createdByEmail: input.actor
    }
  });
}

export async function publishOrderProposal(input: { proposalId: string; actor: string }) {
  const proposal = await prisma.orderProposal.findUnique({
    where: { id: input.proposalId },
    include: { tour: true }
  });

  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  if (proposal.status !== OrderProposalStatus.draft && proposal.status !== OrderProposalStatus.approved) {
    throw new Error("Only draft or approved proposals can be published.");
  }

  const proposedOrder = proposal.proposedOrder as string[];

  await prisma.$transaction(async (tx) => {
    await tx.orderProposal.update({
      where: { id: proposal.id },
      data: {
        status: OrderProposalStatus.published,
        approvedAt: proposal.approvedAt ?? new Date(),
        publishedAt: new Date()
      }
    });

    for (const [index, stopId] of proposedOrder.entries()) {
      await tx.tourStop.update({
        where: {
          tourId_stopId: {
            tourId: proposal.tourId,
            stopId
          }
        },
        data: { position: -1 * (index + 1) }
      });
    }

    for (const [index, stopId] of proposedOrder.entries()) {
      await tx.tourStop.update({
        where: {
          tourId_stopId: {
            tourId: proposal.tourId,
            stopId
          }
        },
        data: { position: index + 1 }
      });
    }

    await tx.adminAuditLog.create({
      data: {
        actor: input.actor,
        action: "publish_order_proposal",
        target: proposal.id,
        details: {
          tourId: proposal.tourId,
          proposedOrder
        } as Prisma.InputJsonValue
      }
    });
  });
}
