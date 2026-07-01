import { AdminStopStatus, OrderProposalStatus, type Prisma } from "@prisma/client";
import { fakeRoute } from "@/lib/route-data";
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
  const existingTour = await prisma.adminTour.findUnique({ where: { slug: fakeRoute.id } });
  if (existingTour) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const tour = await tx.adminTour.create({
      data: {
        slug: fakeRoute.id,
        title: fakeRoute.title,
        targetDurationMinutes: 70
      }
    });

    for (const [index, stop] of fakeRoute.stops.entries()) {
      const adminStop = await tx.adminStop.create({
        data: {
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

      await tx.tourStop.create({
        data: {
          tourId: tour.id,
          stopId: adminStop.id,
          position: index + 1,
          isStart: index === 0,
          isFinale: index === fakeRoute.stops.length - 1
        }
      });
    }
  });
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
          isFinale: Boolean(input.isFinale)
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
