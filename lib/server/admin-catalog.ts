import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AdminStopStatus,
  AdminTourStatus,
  AudioAssetStatus,
  AudioSubjectType,
  CityStatus,
  OrderProposalStatus,
  type Prisma
} from "@prisma/client";
import { fakeRoute, type RoutePack } from "@/lib/route-data";
import { buildOrderProposal } from "@/lib/server/admin-ordering";
import { contentHash, hash12, scriptHash } from "@/lib/server/content-hash";
import { prisma } from "@/lib/server/prisma";

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;

const SASKATOON_CITY_SLUG = "saskatoon";
const SASKATOON_PACK_SLUG = "saskatoon";
const SASKATOON_VOICE_LABEL = "Saskatoon narrator v1";
const elevenLabsSettings = {
  stability: 0.44,
  similarity_boost: 0.82,
  style: 0.24,
  use_speaker_boost: true
};

type DriveLegSource = {
  loops?: Array<{
    id: string;
    legs?: DriveLegSourceItem[];
  }>;
};

type DriveLegSourceItem = {
  fromStopId: string;
  toStopId: string;
  audioFile?: string;
  script: string;
};

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

function parseEstimatedMinutes(value: string) {
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 70;
}

function voiceSnapshot(voice: { provider: string; voiceId: string; modelId: string; settings: Prisma.JsonValue }) {
  return {
    provider: voice.provider,
    voiceId: voice.voiceId,
    modelId: voice.modelId,
    settings: voice.settings
  };
}

function audioStoragePath(input: {
  citySlug: string;
  subjectType: AudioSubjectType;
  subjectId: string;
  contentHash: string;
  legacyPath?: string | null;
}) {
  if (input.legacyPath) {
    return input.legacyPath;
  }

  const folder = input.subjectType === AudioSubjectType.stop ? "stops" : "legs";
  return `audio/${input.citySlug}/${folder}/${input.subjectId}/${hash12(input.contentHash)}.mp3`;
}

const localRoutePackPath = path.join(process.cwd(), "private", "dark-drives-route-pack.json");
const localDriveLegPath = path.join(process.cwd(), "private", "dark-drives-drive-legs.json");

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

async function loadDriveLegSource(): Promise<DriveLegSource> {
  try {
    return JSON.parse(await readFile(localDriveLegPath, "utf8")) as DriveLegSource;
  } catch {
    return { loops: [] };
  }
}

async function ensureSaskatoonCity(tx: Prisma.TransactionClient) {
  let city = await tx.city.upsert({
    where: { slug: SASKATOON_CITY_SLUG },
    update: {
      packSlug: SASKATOON_PACK_SLUG,
      name: "Saskatoon",
      timezone: "America/Regina",
      mapCenterLat: 52.1318,
      mapCenterLng: -106.6298,
      status: CityStatus.live
    },
    create: {
      slug: SASKATOON_CITY_SLUG,
      packSlug: SASKATOON_PACK_SLUG,
      name: "Saskatoon",
      timezone: "America/Regina",
      mapCenterLat: 52.1318,
      mapCenterLng: -106.6298,
      status: CityStatus.live
    }
  });

  const voice = await tx.voiceConfig.upsert({
    where: {
      cityId_label: {
        cityId: city.id,
        label: SASKATOON_VOICE_LABEL
      }
    },
    update: {
      provider: "elevenlabs",
      voiceId: process.env.DARK_DRIVES_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9",
      modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
      settings: elevenLabsSettings
    },
    create: {
      cityId: city.id,
      label: SASKATOON_VOICE_LABEL,
      provider: "elevenlabs",
      voiceId: process.env.DARK_DRIVES_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9",
      modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
      settings: elevenLabsSettings
    }
  });

  if (city.defaultVoiceConfigId !== voice.id) {
    city = await tx.city.update({
      where: { id: city.id },
      data: { defaultVoiceConfigId: voice.id }
    });
  }

  return { city, voice };
}

async function upsertReadyAsset(
  tx: Prisma.TransactionClient,
  input: {
    citySlug: string;
    subjectType: AudioSubjectType;
    subjectId: string;
    script: string;
    legacyPath?: string | null;
    voice: { provider: string; voiceId: string; modelId: string; settings: Prisma.JsonValue };
  }
) {
  const hash = contentHash(input.script, input.voice);
  await tx.audioAsset.upsert({
    where: {
      subjectType_subjectId_contentHash: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        contentHash: hash
      }
    },
    update: {
      voiceConfigSnapshot: voiceSnapshot(input.voice),
      storagePath: audioStoragePath({
        citySlug: input.citySlug,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        contentHash: hash,
        legacyPath: input.legacyPath
      }),
      status: AudioAssetStatus.ready,
      error: null
    },
    create: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      contentHash: hash,
      voiceConfigSnapshot: voiceSnapshot(input.voice),
      storagePath: audioStoragePath({
        citySlug: input.citySlug,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        contentHash: hash,
        legacyPath: input.legacyPath
      }),
      durationSeconds: 0,
      fileBytes: 0,
      status: AudioAssetStatus.ready
    }
  });
}

async function ensureCatalogSeed() {
  const route = await loadSeedRoutePack();
  const driveLegSource = await loadDriveLegSource();
  const operatorLoopIds = [
    "campus-after-dark",
    "west-side-dead-drive",
    "edge-of-town",
    "nutana-broadway"
  ];
  const stopMap = new Map(route.stops.map((stop) => [stop.id, stop]));
  const loops = (route.loops ?? [])
    .filter((loop) => operatorLoopIds.includes(loop.id))
    .sort((a, b) => operatorLoopIds.indexOf(a.id) - operatorLoopIds.indexOf(b.id));
  const driveLegsByPair = new Map<string, DriveLegSourceItem>();

  for (const loop of driveLegSource.loops ?? []) {
    for (const leg of loop.legs ?? []) {
      driveLegsByPair.set(`${leg.fromStopId}->${leg.toStopId}`, leg);
    }
  }

  await prisma.$transaction(async (tx) => {
    const { city, voice } = await ensureSaskatoonCity(tx);

    await tx.adminTour.deleteMany({
      where: { cityId: city.id, slug: fakeRoute.id }
    });

    for (const stop of route.stops) {
      const narrationScript = stop.audio.reviewScript ?? stop.story.body;
      const adminStop = await tx.adminStop.upsert({
        where: {
          cityId_slug: {
            cityId: city.id,
            slug: stop.id
          }
        },
        update: {
          name: stop.title,
          address: stop.parkPoint?.label,
          lat: stop.parkPoint?.lat ?? stop.lat,
          lng: stop.parkPoint?.lng ?? stop.lng,
          narrationScript,
          scriptHash: scriptHash(narrationScript),
          safetyWarning: stop.safetyNote ?? "Review safety guidance before publishing.",
          status: AdminStopStatus.live
        },
        create: {
          cityId: city.id,
          slug: stop.id,
          name: stop.title,
          address: stop.parkPoint?.label,
          lat: stop.parkPoint?.lat ?? stop.lat,
          lng: stop.parkPoint?.lng ?? stop.lng,
          narrationScript,
          scriptHash: scriptHash(narrationScript),
          safetyWarning: stop.safetyNote ?? "Review safety guidance before publishing.",
          themeTags: [],
          status: AdminStopStatus.live
        }
      });

      await upsertReadyAsset(tx, {
        citySlug: city.slug,
        subjectType: AudioSubjectType.stop,
        subjectId: adminStop.id,
        script: narrationScript,
        legacyPath: stop.audio.narrationFile,
        voice
      });
    }

    const adminStops = await tx.adminStop.findMany({ where: { cityId: city.id } });
    const adminStopBySlug = new Map(adminStops.map((stop) => [stop.slug, stop]));

    for (const loop of loops) {
      const tour = await tx.adminTour.upsert({
        where: {
          cityId_slug: {
            cityId: city.id,
            slug: loop.id
          }
        },
        update: {
          title: loop.title,
          targetDurationMinutes: parseEstimatedMinutes(loop.estimatedDuration),
          status: AdminTourStatus.published
        },
        create: {
          cityId: city.id,
          slug: loop.id,
          title: loop.title,
          targetDurationMinutes: parseEstimatedMinutes(loop.estimatedDuration),
          status: AdminTourStatus.published
        }
      });

      const existingStops = await tx.tourStop.count({ where: { tourId: tour.id } });
      if (existingStops === 0) {
        for (const [index, stopId] of loop.stopIds.entries()) {
          const adminStop = adminStopBySlug.get(stopId);
          if (!adminStop) {
            continue;
          }

          await tx.tourStop.create({
            data: {
              tourId: tour.id,
              stopId: adminStop.id,
              position: index + 1,
              isStart: index === 0,
              isFinale: index === loop.stopIds.length - 1
            }
          });
        }
      }

      for (const pair of loop.legs ?? []) {
        const sourceLeg = driveLegsByPair.get(`${pair.fromStopId}->${pair.toStopId}`);
        const fromStop = adminStopBySlug.get(pair.fromStopId);
        const toStop = adminStopBySlug.get(pair.toStopId);
        if (!sourceLeg?.script || !fromStop || !toStop) {
          continue;
        }

        const leg = await tx.leg.upsert({
          where: {
            cityId_fromStopId_toStopId: {
              cityId: city.id,
              fromStopId: fromStop.id,
              toStopId: toStop.id
            }
          },
          update: {
            driveScript: sourceLeg.script,
            scriptHash: scriptHash(sourceLeg.script)
          },
          create: {
            cityId: city.id,
            fromStopId: fromStop.id,
            toStopId: toStop.id,
            driveScript: sourceLeg.script,
            scriptHash: scriptHash(sourceLeg.script)
          }
        });

        await upsertReadyAsset(tx, {
          citySlug: city.slug,
          subjectType: AudioSubjectType.leg,
          subjectId: leg.id,
          script: sourceLeg.script,
          legacyPath: sourceLeg.audioFile ?? pair.audioFile,
          voice
        });
      }
    }
  });
}

async function getSaskatoonCity() {
  const city = await prisma.city.findUnique({
    where: { slug: SASKATOON_CITY_SLUG },
    include: { defaultVoiceConfig: true }
  });

  if (!city?.defaultVoiceConfig) {
    throw new Error("Saskatoon city or voice config is not seeded.");
  }

  return city;
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

async function createPendingAsset(input: {
  subjectType: AudioSubjectType;
  subjectId: string;
  script: string;
  citySlug: string;
  voice: { provider: string; voiceId: string; modelId: string; settings: Prisma.JsonValue };
}) {
  const hash = contentHash(input.script, input.voice);
  await prisma.audioAsset.upsert({
    where: {
      subjectType_subjectId_contentHash: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        contentHash: hash
      }
    },
    update: {
      status: AudioAssetStatus.pending,
      error: null
    },
    create: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      contentHash: hash,
      voiceConfigSnapshot: voiceSnapshot(input.voice),
      storagePath: audioStoragePath({
        citySlug: input.citySlug,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        contentHash: hash
      }),
      durationSeconds: 0,
      fileBytes: 0,
      status: AudioAssetStatus.pending
    }
  });
}

export async function getAdminDashboardData() {
  await ensureCatalogSeed();
  const city = await getSaskatoonCity();
  if (!city.defaultVoiceConfig) {
    throw new Error("Saskatoon voice config is not seeded.");
  }
  const voiceConfig = city.defaultVoiceConfig as NonNullable<typeof city.defaultVoiceConfig>;

  const [tours, stops, proposals, legs, assets] = await Promise.all([
    prisma.adminTour.findMany({
      where: { cityId: city.id },
      orderBy: { title: "asc" },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { stop: true }
        }
      }
    }),
    prisma.adminStop.findMany({
      where: { cityId: city.id },
      orderBy: { updatedAt: "desc" },
      include: {
        tourStops: {
          include: { tour: true },
          orderBy: { position: "asc" }
        }
      }
    }),
    prisma.orderProposal.findMany({
      where: { tour: { cityId: city.id } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { tour: true }
    }),
    prisma.leg.findMany({ where: { cityId: city.id } }),
    prisma.audioAsset.findMany({
      where: { status: AudioAssetStatus.ready },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const readyAssetBySubjectHash = new Map(
    assets.map((asset) => [`${asset.subjectType}:${asset.subjectId}:${asset.contentHash}`, asset])
  );
  const legByPair = new Map(legs.map((leg) => [`${leg.fromStopId}->${leg.toStopId}`, leg]));

  function stopAudio(stop: { id: string; narrationScript: string }) {
    const hash = contentHash(stop.narrationScript, voiceConfig);
    return readyAssetBySubjectHash.get(`${AudioSubjectType.stop}:${stop.id}:${hash}`) ?? null;
  }

  function legAudio(fromStopId: string, toStopId?: string) {
    if (!toStopId) {
      return { asset: null, leg: null };
    }
    const leg = legByPair.get(`${fromStopId}->${toStopId}`) ?? null;
    if (!leg) {
      return { asset: null, leg: null };
    }
    const hash = contentHash(leg.driveScript, voiceConfig);
    return {
      asset: readyAssetBySubjectHash.get(`${AudioSubjectType.leg}:${leg.id}:${hash}`) ?? null,
      leg
    };
  }

  const decoratedTours = tours.map((tour) => {
    const sortedStops = [...tour.stops].sort((a, b) => a.position - b.position);
    return {
      ...tour,
      stops: sortedStops.map((membership, index) => {
        const next = sortedStops[index + 1];
        const narrationAsset = stopAudio(membership.stop);
        const { asset: driveAsset } = legAudio(membership.stopId, next?.stopId);
        return {
          ...membership,
          narrationAudio: narrationAsset?.storagePath ?? null,
          driveToNextAudio: driveAsset?.storagePath ?? null,
          audioStatus: narrationAsset && (!next || driveAsset) ? "ready" : "needs_generation"
        };
      })
    };
  });

  const decoratedStops = stops.map((stop) => ({
    ...stop,
    audioStatus: stopAudio(stop) ? "ready" : "needs_generation"
  }));

  return {
    cities: [{ ...city, defaultVoiceConfig: voiceConfig }],
    activeCitySlug: city.slug,
    tours: decoratedTours,
    stops: decoratedStops,
    proposals
  };
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
  await ensureCatalogSeed();
  const city = await getSaskatoonCity();
  const geocoded = input.address ? await geocodeAddress(input.address) : null;
  const lat = input.lat ?? geocoded?.lat;
  const lng = input.lng ?? geocoded?.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Coordinates are required until a routing provider geocoder is configured.");
  }

  const narrationScript = input.narrationScript.trim();

  return prisma.$transaction(async (tx) => {
    const stop = await tx.adminStop.create({
      data: {
        cityId: city.id,
        slug: `${slugify(input.name)}-${Date.now().toString(36)}`,
        name: input.name.trim(),
        address: input.address?.trim(),
        lat,
        lng,
        narrationScript,
        scriptHash: scriptHash(narrationScript),
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
  const narrationScript = input.narrationScript.trim();
  return prisma.adminStop.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      address: input.address?.trim(),
      lat: input.lat,
      lng: input.lng,
      narrationScript,
      scriptHash: scriptHash(narrationScript),
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
  await ensureCatalogSeed();
  const city = await getSaskatoonCity();
  const title = input.title.trim() || "Untitled Tour";
  return prisma.adminTour.create({
    data: {
      cityId: city.id,
      slug: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      targetDurationMinutes: input.targetDurationMinutes,
      status: AdminTourStatus.draft
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
}) {
  return prisma.tourStop.update({
    where: { id: input.membershipId },
    data: {
      position: input.position,
      isStart: input.isStart,
      isFinale: input.isFinale
    }
  });
}

export async function addStopToTour(input: {
  tourId: string;
  stopId: string;
}) {
  const last = await prisma.tourStop.findFirst({
    where: { tourId: input.tourId },
    orderBy: { position: "desc" }
  });

  return prisma.tourStop.create({
    data: {
      tourId: input.tourId,
      stopId: input.stopId,
      position: (last?.position ?? 0) + 1
    }
  });
}

export async function removeStopFromTour(membershipId: string) {
  await prisma.tourStop.delete({ where: { id: membershipId } });
}

export async function markTourAudioQueued(tourId: string) {
  const city = await getSaskatoonCity();
  const voice = city.defaultVoiceConfig;
  if (!voice) {
    throw new Error("Saskatoon voice config is not seeded.");
  }
  const tour = await prisma.adminTour.findUnique({
    where: { id: tourId },
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

  for (const membership of tour.stops) {
    await createPendingAsset({
      subjectType: AudioSubjectType.stop,
      subjectId: membership.stopId,
      script: membership.stop.narrationScript,
      citySlug: city.slug,
      voice
    });
  }

  const legs = await prisma.leg.findMany({ where: { cityId: city.id } });
  const legByPair = new Map(legs.map((leg) => [`${leg.fromStopId}->${leg.toStopId}`, leg]));
  for (let index = 0; index < tour.stops.length - 1; index += 1) {
    const current = tour.stops[index];
    const next = tour.stops[index + 1];
    const leg = legByPair.get(`${current.stopId}->${next.stopId}`);
    if (!leg) {
      continue;
    }

    await createPendingAsset({
      subjectType: AudioSubjectType.leg,
      subjectId: leg.id,
      script: leg.driveScript,
      citySlug: city.slug,
      voice
    });
  }
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
