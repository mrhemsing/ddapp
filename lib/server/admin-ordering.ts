import type { AdminStop, AdminTour, TourStop } from "@prisma/client";

export type StopWithMembership = TourStop & {
  stop: AdminStop;
};

export type TourWithStops = AdminTour & {
  stops: StopWithMembership[];
};

export type OrderProposalResult = {
  currentOrder: string[];
  proposedOrder: string[];
  placementReasons: Array<{
    stopId: string;
    reason: string;
  }>;
  invalidatedLegs: Array<{
    fromStopId: string;
    toStopId: string;
    reason: string;
  }>;
  issues: string[];
  durationMinutes: number;
  targetDurationMinutes: number;
  durationDeltaMinutes: number;
  engineSummary: string;
};

const SASKATOON_RIVER_LNG = -106.6508;

function distanceKm(a: AdminStop, b: AdminStop) {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function roadWeightedMinutes(a: AdminStop, b: AdminStop) {
  const crossesRiver = (a.lng < SASKATOON_RIVER_LNG && b.lng >= SASKATOON_RIVER_LNG) ||
    (a.lng >= SASKATOON_RIVER_LNG && b.lng < SASKATOON_RIVER_LNG);
  const roadKm = distanceKm(a, b) * (crossesRiver ? 1.85 : 1.28);
  return Math.max(4, Math.round((roadKm / 36) * 60));
}

function legKey(fromStopId: string, toStopId: string) {
  return `${fromStopId}->${toStopId}`;
}

function getLegs(order: string[]) {
  return order.slice(0, -1).map((fromStopId, index) => ({
    fromStopId,
    toStopId: order[index + 1]
  }));
}

function orderByNearestNeighbor(stops: AdminStop[], start: AdminStop, finale: AdminStop | null) {
  const remaining = stops.filter((stop) => stop.id !== start.id && stop.id !== finale?.id);
  const ordered = [start];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    remaining.sort((a, b) => roadWeightedMinutes(current, a) - roadWeightedMinutes(current, b));
    ordered.push(remaining.shift()!);
  }

  if (finale) {
    ordered.push(finale);
  }

  return ordered;
}

function applyTwoOpt(stops: AdminStop[], keepStart: boolean, keepFinale: boolean) {
  let route = [...stops];
  let improved = true;

  while (improved) {
    improved = false;
    const startIndex = keepStart ? 1 : 0;
    const endIndex = keepFinale ? route.length - 2 : route.length - 1;

    for (let i = startIndex; i < endIndex - 1; i += 1) {
      for (let k = i + 1; k < endIndex; k += 1) {
        const before =
          roadWeightedMinutes(route[i - 1], route[i]) +
          roadWeightedMinutes(route[k], route[k + 1]);
        const after =
          roadWeightedMinutes(route[i - 1], route[k]) +
          roadWeightedMinutes(route[i], route[k + 1]);

        if (after + 1 < before) {
          route = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
          improved = true;
        }
      }
    }
  }

  return route;
}

function narrativeReason(stop: AdminStop, index: number, total: number) {
  const tags = stop.themeTags.length ? stop.themeTags.join(", ") : "general haunt";
  if (index === 0) {
    return "Kept first because it is marked as the tour start.";
  }
  if (index === total - 1) {
    return "Kept last because it is marked as the finale.";
  }
  if (stop.status === "held") {
    return "Held stop is flagged for review and should not publish live until cleared.";
  }
  return `Placed here to keep the drive sane while grouping ${tags} material into the surrounding pace.`;
}

export function buildOrderProposal(tour: TourWithStops, trigger: string): OrderProposalResult {
  const sortedMemberships = [...tour.stops].sort((a, b) => a.position - b.position);
  const currentOrder = sortedMemberships.map((membership) => membership.stopId);
  const liveMemberships = sortedMemberships.filter((membership) => membership.stop.status === "live");
  const heldMemberships = sortedMemberships.filter((membership) => membership.stop.status === "held");

  const startMembership = liveMemberships.find((membership) => membership.isStart) ?? liveMemberships[0];
  const finaleMembership = [...liveMemberships].reverse().find((membership) => membership.isFinale) ?? null;
  const issues: string[] = [];

  if (!startMembership) {
    issues.push("No live start stop is available.");
    return {
      currentOrder,
      proposedOrder: currentOrder,
      placementReasons: [],
      invalidatedLegs: [],
      issues,
      durationMinutes: 0,
      targetDurationMinutes: tour.targetDurationMinutes,
      durationDeltaMinutes: -tour.targetDurationMinutes,
      engineSummary: "No proposal could be built because this tour has no live stops."
    };
  }

  if (heldMemberships.length > 0) {
    issues.push(`${heldMemberships.length} held stop${heldMemberships.length === 1 ? "" : "s"} excluded from live ordering.`);
  }

  const geographicOrder = orderByNearestNeighbor(
    liveMemberships.map((membership) => membership.stop),
    startMembership.stop,
    finaleMembership?.stop ?? null
  );
  const optimizedOrder = applyTwoOpt(geographicOrder, true, Boolean(finaleMembership));
  const proposedOrder = optimizedOrder.map((stop) => stop.id);

  const currentLegs = new Set(getLegs(currentOrder).map((leg) => legKey(leg.fromStopId, leg.toStopId)));
  const invalidatedLegs = getLegs(currentOrder)
    .filter((leg) => !getLegs(proposedOrder).some((nextLeg) => legKey(nextLeg.fromStopId, nextLeg.toStopId) === legKey(leg.fromStopId, leg.toStopId)))
    .map((leg) => ({
      ...leg,
      reason: "This stop-to-stop transition changes and its drive-leg audio must be regenerated."
    }));

  for (const leg of getLegs(proposedOrder)) {
    const from = liveMemberships.find((membership) => membership.stopId === leg.fromStopId)?.stop;
    const to = liveMemberships.find((membership) => membership.stopId === leg.toStopId)?.stop;
    if (from && to && roadWeightedMinutes(from, to) >= 18) {
      issues.push(`${from.name} to ${to.name} is a long road leg and should be reviewed on the map.`);
    }
    currentLegs.add(legKey(leg.fromStopId, leg.toStopId));
  }

  const durationMinutes = getLegs(proposedOrder).reduce((total, leg) => {
    const from = liveMemberships.find((membership) => membership.stopId === leg.fromStopId)?.stop;
    const to = liveMemberships.find((membership) => membership.stopId === leg.toStopId)?.stop;
    return from && to ? total + roadWeightedMinutes(from, to) : total;
  }, proposedOrder.length * 7);

  const durationDeltaMinutes = durationMinutes - tour.targetDurationMinutes;
  if (durationDeltaMinutes > 12) {
    issues.push(`Estimated drive is ${durationDeltaMinutes} minutes over target.`);
  }

  return {
    currentOrder,
    proposedOrder,
    placementReasons: optimizedOrder.map((stop, index) => ({
      stopId: stop.id,
      reason: narrativeReason(stop, index, optimizedOrder.length)
    })),
    invalidatedLegs,
    issues,
    durationMinutes,
    targetDurationMinutes: tour.targetDurationMinutes,
    durationDeltaMinutes,
    engineSummary: [
      "Geographic engine used road-weighted estimates with nearest-neighbor plus 2-opt.",
      "Narrative engine preserved start and finale, excluded held stops, and supplied editorial placement reasons.",
      process.env.MAPBOX_ACCESS_TOKEN || process.env.GOOGLE_MAPS_API_KEY
        ? "Routing provider key is configured server side."
        : "Routing provider is not configured yet, so this proposal is marked as an estimate."
    ].join(" ")
  };
}
