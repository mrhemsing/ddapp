"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cacheRouteAudio, isRouteCached, type CacheProgress } from "@/lib/audio-cache";
import { DarkDrivesAudioEngine } from "@/lib/audio-engine";
import type { RoutePack, Stop } from "@/lib/route-data";
import { createWakeLockHandle } from "@/lib/wake-lock";

type PlayerState =
  | "preflight"
  | "ready"
  | "intro"
  | "introPlayed"
  | "traveling"
  | "approaching"
  | "armed"
  | "playing"
  | "played"
  | "outro"
  | "outroPlayed"
  | "ended";
type LocationMode = "unknown" | "watching" | "manual" | "denied";
type NarrationPlayback = "idle" | "playing" | "paused";
const activeDriveStates: PlayerState[] = ["intro", "introPlayed", "traveling", "approaching", "armed", "playing", "played", "outro", "outroPlayed"];
const resumeStorageKey = "dark-drives:route-session";
const welcomeSeenStorageKey = "dark-drives:welcome-seen";

type SessionEvent =
  | { type: "stopCompleted"; stopId: string; stopTitle: string; timestamp: string }
  | { type: "ritual"; stopId: string; stopTitle: string; ritualId: string; ritualLabel: string; payoffFired: boolean; timestamp: string };

type ResumeState = {
  routeId: string;
  loopId?: string;
  activeStopIndex: number;
  skippedStopIds: string[];
  sessionEvents: SessionEvent[];
  completedLoopIds?: string[];
  savedAt: string;
};

type PositionFix = {
  lat: number;
  lng: number;
  speedMps: number | null;
  timestamp: number;
};

type WelcomeLoop = NonNullable<RoutePack["loops"]>[number] & {
  coverage: string;
  startNeighborhood: string;
  startStop: Stop | null;
  distanceMeters: number | null;
  isClosest: boolean;
  isMarathon: boolean;
};

const loopWelcomeMeta: Record<string, { coverage: string; startNeighborhood: string }> = {
  "campus-after-dark": {
    coverage: "University and riverbank",
    startNeighborhood: "near the U of S campus"
  },
  "west-side-dead-drive": {
    coverage: "West and southwest to the river valley",
    startNeighborhood: "in Westmount"
  },
  "edge-of-town": {
    coverage: "North and east edges past city limits",
    startNeighborhood: "in Lawson Heights"
  },
  "nutana-broadway": {
    coverage: "Nutana, Broadway, and old south-central",
    startNeighborhood: "in Nutana"
  },
  "complete-the-city": {
    coverage: "All of Saskatoon",
    startNeighborhood: "north-central"
  }
};

const saskatoonCenter = { lat: 52.1318, lng: -106.6608 };
const saskatoonDistanceCutoffMeters = 100000;

function haversineMeters(a: PositionFix, stop: Pick<Stop, "lat" | "lng">) {
  const radius = 6371000;
  const dLat = ((stop.lat - a.lat) * Math.PI) / 180;
  const dLng = ((stop.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (stop.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function mapsUrl(stop: Stop) {
  const destinationPoint = stop.parkPoint ?? stop;
  const destination = `${destinationPoint.lat},${destinationPoint.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function speedAwareArriveRadius(stop: Stop, speedMps: number | null) {
  const roadSpeedMps = Math.max(speedMps ?? 0, 0);
  const speedBoost = roadSpeedMps * 6;
  return Math.round(Math.min(Math.max(stop.arriveRadiusM + speedBoost, stop.arriveRadiusM), stop.arriveRadiusM * 2.6));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function approachProgress(distanceMeters: number, approachRadiusM: number, arriveRadiusM: number) {
  const range = Math.max(approachRadiusM - arriveRadiusM, 1);
  return clamp((approachRadiusM - distanceMeters) / range, 0, 1);
}

function stateCopy(playerState: PlayerState) {
  if (playerState === "preflight") return "Files sealed";
  if (playerState === "ready") return "Ready";
  if (playerState === "intro") return "Opening signal";
  if (playerState === "introPlayed") return "Opening heard";
  if (playerState === "traveling") return "The road is quiet";
  if (playerState === "approaching") return "Something is close";
  if (playerState === "armed") return "It's here";
  if (playerState === "playing") return "Listen";
  if (playerState === "played") return "File open";
  if (playerState === "outro") return "Final signal";
  if (playerState === "outroPlayed") return "Final heard";
  return "Route closed";
}

function presenceCopy(playerState: PlayerState, distanceMeters: number | null, narrationPlayback: NarrationPlayback) {
  if ((playerState === "intro" || playerState === "outro") && narrationPlayback === "paused") return "Signal held";
  if (playerState === "intro") return "Signal active";
  if (playerState === "introPlayed") return "Opening heard";
  if (playerState === "approaching" && distanceMeters !== null) return `${distanceMeters.toLocaleString()}m`;
  if (playerState === "armed") return "It found the car";
  if (playerState === "playing" && narrationPlayback === "paused") return "Signal held";
  if (playerState === "playing") return "Signal active";
  if (playerState === "played") return "The file is open";
  if (playerState === "outro") return "Signal active";
  if (playerState === "outroPlayed") return "Final heard";
  if (playerState === "traveling") return "Nothing on the glass";
  return "Waiting";
}

function localTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function loopHref(loopId: string) {
  return `/?loop=${encodeURIComponent(loopId)}`;
}

function formatApproxDistance(meters: number) {
  if (meters < 1000) {
    return `${Math.max(100, Math.round(meters / 100) * 100)}m`;
  }

  const kilometers = meters / 1000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers).toString()} km`;
}

function loopIdFromLocation(route: RoutePack) {
  const loopId = new URL(window.location.href).searchParams.get("loop");
  if (!loopId || !route.loops?.some((loop) => loop.id === loopId)) {
    return null;
  }
  return loopId;
}

function recapStats(events: SessionEvent[]) {
  const completedById = new Map<string, Extract<SessionEvent, { type: "stopCompleted" }>>();
  for (const event of events) {
    if (event.type === "stopCompleted" && !completedById.has(event.stopId)) {
      completedById.set(event.stopId, event);
    }
  }
  const completedStops = [...completedById.values()];
  const rituals = events.filter((event) => event.type === "ritual");
  const answered = rituals.filter((event) => event.payoffFired);
  const featured = answered[0] ?? rituals[0] ?? completedStops.at(-1);

  return {
    completedStops,
    rituals,
    answered,
    featured
  };
}

function projectPoint(position: Pick<Stop, "lat" | "lng">, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  const x = ((position.lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 0.0001)) * 82 + 9;
  const y = (1 - (position.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.0001)) * 70 + 15;
  return { x, y };
}

function RouteMap({
  stops,
  activeStopIndex,
  currentPosition
}: {
  stops: Stop[];
  activeStopIndex: number;
  currentPosition: PositionFix | null;
}) {
  const points = stops.map((stop) => stop.parkPoint ?? stop);
  const allPoints = currentPosition ? [...points, currentPosition] : points;
  const latValues = allPoints.map((point) => point.lat);
  const lngValues = allPoints.map((point) => point.lng);
  const bounds = {
    minLat: Math.min(...latValues) - 0.008,
    maxLat: Math.max(...latValues) + 0.008,
    minLng: Math.min(...lngValues) - 0.008,
    maxLng: Math.max(...lngValues) + 0.008
  };
  const plottedStops = points.map((point) => projectPoint(point, bounds));
  const current = currentPosition ? projectPoint(currentPosition, bounds) : null;
  const path = plottedStops.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="route-map" aria-label="Offline route schematic">
      <div className="map-caption">
        <span>Route schematic</span>
        <strong>{current ? "GPS live" : "manual mode"}</strong>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Current route progress">
        <defs>
          <filter id="mapGlow">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polyline className="route-path" points={path} />
        {plottedStops.map((point, index) => (
          <g key={stops[index].id} className={index === activeStopIndex ? "active-node" : ""}>
            <circle
              className={index === 0 ? "start-node" : index === plottedStops.length - 1 ? "finish-node" : "stop-node"}
              cx={point.x}
              cy={point.y}
              r={index === activeStopIndex ? 4.2 : 3.4}
            />
            <text x={point.x} y={point.y + 1.4} textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
        {current && (
          <g filter="url(#mapGlow)">
            <circle className="position-pulse" cx={current.x} cy={current.y} r="6.5" />
            <circle className="position-dot" cx={current.x} cy={current.y} r="2.8" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function RoutePlayer() {
  const [route, setRoute] = useState<RoutePack | null>(null);
  const [routeError, setRouteError] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState>("preflight");
  const [cacheProgress, setCacheProgress] = useState<CacheProgress>({ complete: 0, total: 0, percent: 0 });
  const [cacheError, setCacheError] = useState("");
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [effectiveArriveRadius, setEffectiveArriveRadius] = useState<number | null>(null);
  const [approachIntensity, setApproachIntensity] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<PositionFix | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("unknown");
  const [audioStatus, setAudioStatus] = useState("Locked");
  const [wakeStatus, setWakeStatus] = useState("Not requested");
  const [narrationPlayback, setNarrationPlayback] = useState<NarrationPlayback>("idle");
  const [isForeground, setIsForeground] = useState(true);
  const [ritualMessage, setRitualMessage] = useState("");
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [skippedStopIds, setSkippedStopIds] = useState<string[]>([]);
  const [completedLoopIds, setCompletedLoopIds] = useState<string[]>([]);
  const [isStopsBoardOpen, setIsStopsBoardOpen] = useState(false);
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);
  const [hasCheckedResume, setHasCheckedResume] = useState(false);
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [isLoopPickerOpen, setIsLoopPickerOpen] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [welcomePosition, setWelcomePosition] = useState<PositionFix | null>(null);
  const [welcomeLocationStatus, setWelcomeLocationStatus] = useState<"idle" | "requesting" | "enabled" | "denied" | "far">("idle");
  const [shareStatus, setShareStatus] = useState("");
  const audioEngine = useRef<DarkDrivesAudioEngine | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const wakeLock = useRef(createWakeLockHandle());
  const playbackToken = useRef(0);
  const lastLocationUpdate = useRef(0);
  const lastPositionFix = useRef<PositionFix | null>(null);
  const hasAutoArmedStop = useRef(false);
  const routeHasLoops = Boolean(route?.loops?.length);
  const selectedLoop = selectedLoopId ? route?.loops?.find((loop) => loop.id === selectedLoopId) ?? null : null;
  const stopById = useMemo(() => new Map(route?.stops.map((stop) => [stop.id, stop]) ?? []), [route]);
  const sealedStopById = useMemo(() => new Map(route?.sealedStops?.map((stop) => [stop.id, stop]) ?? []), [route]);
  const activeStops = useMemo(() => {
    if (!route) return [];
    if (routeHasLoops && !selectedLoop) return [];
    if (!selectedLoop) return route.stops;
    return selectedLoop.stopIds.map((id) => stopById.get(id)).filter((stop): stop is Stop => Boolean(stop));
  }, [route, routeHasLoops, selectedLoop, stopById]);
  const selectedLoopSealedStops = useMemo(() => {
    if (!selectedLoop) return route?.sealedStops ?? [];
    const ids = new Set(selectedLoop.stopIds);
    return route?.sealedStops?.filter((stop) => ids.has(stop.id)) ?? [];
  }, [route, selectedLoop]);
  const currentStop = activeStops[activeStopIndex] ?? null;
  const ambientUrl = currentStop?.audio.ambientFile ?? "/audio/ambient-low.wav";
  const loopLegByMove = useMemo(() => {
    const legs = selectedLoop?.legs ?? [];
    return new Map(legs.map((leg) => [`${leg.fromStopId}->${leg.toStopId}`, leg]));
  }, [selectedLoop]);
  const isDriveActive = activeDriveStates.includes(playerState);
  const isPreDrive = playerState === "preflight" || playerState === "ready";
  const isChoosingLoop = Boolean(route && hasCheckedResume && routeHasLoops && !selectedLoop && isPreDrive && !resumeState);
  const heartbeatMs = Math.round(2200 - approachIntensity * 1500);
  const stats = recapStats(sessionEvents);
  const completedStopIds = useMemo(
    () => new Set(stats.completedStops.map((event) => event.stopId)),
    [stats.completedStops]
  );
  const skippedStopIdSet = useMemo(() => new Set(skippedStopIds), [skippedStopIds]);
  const canSkip = Boolean(
    route &&
    currentStop &&
    activeStopIndex < activeStops.length - 1 &&
    (playerState === "traveling" || playerState === "approaching" || playerState === "armed")
  );
  const canArmManually = Boolean(
    route &&
    currentStop &&
    (playerState === "traveling" || playerState === "approaching" || playerState === "armed")
  );
  const screenClassName = ["screen", isDriveActive ? "drive-active" : ""].filter(Boolean).join(" ");
  const selectedLoopLiveCount = activeStops.length;
  const selectedLoopHeldCount = selectedLoopSealedStops.length;
  const selectedLoopFinale = activeStops.at(-1)?.title ?? currentStop?.title ?? "Final stop";
  const authoredLoops = useMemo(
    () => route?.loops?.filter((loop) => loop.id !== "complete-the-city") ?? [],
    [route]
  );
  const welcomeLoops = useMemo<WelcomeLoop[]>(() => {
    const loops = route?.loops ?? [];
    const withDetails = loops.map((loop) => {
      const startStop = loop.stopIds.map((id) => stopById.get(id)).find((stop): stop is Stop => Boolean(stop)) ?? null;
      const meta = loopWelcomeMeta[loop.id] ?? {
        coverage: "Saskatoon",
        startNeighborhood: startStop ? `near ${startStop.title}` : "at the first live stop"
      };

      return {
        ...loop,
        coverage: meta.coverage,
        startNeighborhood: meta.startNeighborhood,
        startStop,
        distanceMeters: welcomePosition && startStop ? haversineMeters(welcomePosition, startStop) : null,
        isClosest: false,
        isMarathon: loop.id === "complete-the-city"
      };
    });

    const realLoops = withDetails.filter((loop) => !loop.isMarathon);
    const marathon = withDetails.find((loop) => loop.isMarathon);
    let ordered = realLoops;

    if (welcomeLocationStatus === "enabled" && welcomePosition) {
      ordered = [...realLoops].sort((a, b) => {
        const distanceA = a.distanceMeters ?? Number.POSITIVE_INFINITY;
        const distanceB = b.distanceMeters ?? Number.POSITIVE_INFINITY;
        return distanceA - distanceB;
      });
    } else {
      const campus = realLoops.find((loop) => loop.id === "campus-after-dark");
      const others = realLoops.filter((loop) => loop.id !== "campus-after-dark");
      ordered = campus ? [campus, ...others] : realLoops;
    }

    const closestId = welcomeLocationStatus === "enabled" ? ordered[0]?.id : null;
    const pinned = marathon ? [...ordered, marathon] : ordered;
    return pinned.map((loop) => ({ ...loop, isClosest: loop.id === closestId }));
  }, [route?.loops, stopById, welcomeLocationStatus, welcomePosition]);
  const completedLoopIdSet = useMemo(() => new Set(completedLoopIds), [completedLoopIds]);
  const nextUnfinishedLoop = authoredLoops.find((loop) => !completedLoopIdSet.has(loop.id));
  const loopsLeftTonight = authoredLoops.filter((loop) => !completedLoopIdSet.has(loop.id)).length;
  const statusLabel = !route
    ? routeError ? "Locked" : "Loading"
    : resumeState && isPreDrive ? "Resume"
      : !hasCheckedResume && isPreDrive ? "Checking"
        : isChoosingLoop ? "Choose Night"
          : stateCopy(playerState);

  function loopFinaleTitle(loop: NonNullable<RoutePack["loops"]>[number]) {
    const finaleId = loop.stopIds.at(-1);
    if (!finaleId) {
      return "final file";
    }
    return stopById.get(finaleId)?.title ?? sealedStopById.get(finaleId)?.title ?? "final file";
  }

  useEffect(() => {
    screenRef.current?.style.setProperty("--approach-intensity", approachIntensity.toFixed(3));
    screenRef.current?.style.setProperty("--heartbeat-ms", `${heartbeatMs}ms`);
  }, [approachIntensity, heartbeatMs]);

  useEffect(() => {
    setHasSeenWelcome(window.localStorage.getItem(welcomeSeenStorageKey) === "true");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadRoute() {
      setRouteError("");
      try {
        const response = await fetch("/api/route/pack", { cache: "no-store" });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error ?? "Route pack unavailable.");
        }

        const data = (await response.json()) as RoutePack;
        if (active) {
          setRoute(data);
        }
      } catch (error) {
        if (active) {
          setRouteError(error instanceof Error ? error.message : "Route pack unavailable.");
        }
      }
    }

    void loadRoute();

    return () => {
      active = false;
    };
  }, []);

  const primary = useMemo(() => {
    if (!route) return { label: "Loading Route", disabled: true, className: "" };
    if (playerState === "preflight") return { label: "Prepare Route", disabled: false, className: "" };
    if (playerState === "ready") return { label: "Begin Drive", disabled: false, className: "ready" };
    if (playerState === "intro" || playerState === "outro") {
      return {
        label: narrationPlayback === "paused" ? "Resume" : "Pause",
        disabled: false,
        className: narrationPlayback === "paused" ? "paused" : "playing"
      };
    }
    if (playerState === "introPlayed" || playerState === "outroPlayed") return { label: "Replay", disabled: false, className: "replay" };
    if (playerState === "traveling") return { label: "Keep Driving", disabled: true, className: "" };
    if (playerState === "approaching") return { label: "Something Is Close", disabled: true, className: "approaching" };
    if (playerState === "armed") return { label: "Wake It", disabled: false, className: "ready" };
    if (playerState === "playing") {
      return {
        label: narrationPlayback === "paused" ? "Resume" : "Pause",
        disabled: false,
        className: narrationPlayback === "paused" ? "paused" : "playing"
      };
    }
    if (playerState === "played") return { label: "Replay", disabled: false, className: "replay" };
    return { label: "Route Closed", disabled: true, className: "" };
  }, [narrationPlayback, playerState, route]);

  useEffect(() => {
    if (!route) {
      return;
    }

    const urlLoopId = loopIdFromLocation(route);
    if (urlLoopId) {
      window.localStorage.setItem(welcomeSeenStorageKey, "true");
      setHasSeenWelcome(true);
      setSelectedLoopId(urlLoopId);
      setResumeState(null);
      setHasCheckedResume(true);
    } else {
      try {
        const stored = window.localStorage.getItem(resumeStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as ResumeState;
          if (parsed.routeId === route.id && (!parsed.loopId || route.loops?.some((loop) => loop.id === parsed.loopId))) {
            if (parsed.loopId) {
              setSelectedLoopId(parsed.loopId);
            }
            setResumeState(parsed);
          }
        }
      } catch {
        window.localStorage.removeItem(resumeStorageKey);
      } finally {
        setHasCheckedResume(true);
      }
    }

    audioEngine.current = new DarkDrivesAudioEngine();

    void isRouteCached(route).then((cached) => {
      if (cached) {
        setCacheProgress({ complete: 1, total: 1, percent: 100 });
        setPlayerState("ready");
      }
    });
  }, [route]);

  useEffect(() => {
    if (!route) {
      return;
    }

    const handlePopState = () => {
      const loopId = loopIdFromLocation(route);
      if (loopId) {
        selectLoop(loopId, { updateUrl: false });
      } else {
        void returnHome({ updateUrl: false });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [route, selectedLoop?.id]);

  useEffect(() => {
    if (!route) {
      return;
    }

    if (playerState === "ended") {
      window.localStorage.removeItem(resumeStorageKey);
      return;
    }

    if (playerState === "preflight" || playerState === "ready" || playerState === "intro" || playerState === "introPlayed") {
      return;
    }

    const state: ResumeState = {
      routeId: route.id,
      loopId: selectedLoop?.id,
      activeStopIndex,
      skippedStopIds,
      sessionEvents,
      completedLoopIds,
      savedAt: new Date().toISOString()
    };
    window.localStorage.setItem(resumeStorageKey, JSON.stringify(state));
  }, [activeStopIndex, completedLoopIds, playerState, route, selectedLoop, sessionEvents, skippedStopIds]);

  useEffect(() => {
    const handleVisibility = () => setIsForeground(document.visibilityState === "visible");
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!route || !currentStop || !isForeground || (playerState !== "traveling" && playerState !== "approaching" && playerState !== "armed")) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationMode("manual");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastLocationUpdate.current < 1100) {
          return;
        }

        const previous = lastPositionFix.current;
        const current: PositionFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speedMps: position.coords.speed,
          timestamp: position.timestamp
        };

        if (current.speedMps === null && previous) {
          const elapsedSeconds = Math.max((current.timestamp - previous.timestamp) / 1000, 1);
          current.speedMps = haversineMeters(current, previous) / elapsedSeconds;
        }

        lastLocationUpdate.current = now;
        lastPositionFix.current = current;
        setCurrentPosition(current);
        const armPoint = currentStop.parkPoint ?? currentStop;
        const meters = haversineMeters(current, armPoint);
        const armRadius = speedAwareArriveRadius(currentStop, current.speedMps);
        const intensity = approachProgress(meters, currentStop.approachRadiusM, armRadius);
        setDistanceMeters(meters);
        setEffectiveArriveRadius(armRadius);
        setApproachIntensity(intensity);
        setLocationMode("watching");

        if (playerState === "armed" || hasAutoArmedStop.current) {
          audioEngine.current?.setAmbientVolume(0.44);
          return;
        }

        if (meters <= armRadius) {
          hasAutoArmedStop.current = true;
          navigator.vibrate?.(80);
          setPlayerState("armed");
          audioEngine.current?.setAmbientVolume(0.44);
        } else if (meters <= currentStop.approachRadiusM) {
          setPlayerState("approaching");
          void audioEngine.current?.startAmbient(ambientUrl);
          audioEngine.current?.setAmbientVolume(0.2 + intensity * 0.22);
        } else if (playerState === "approaching" && meters > currentStop.approachRadiusM + 75) {
          setPlayerState("traveling");
          setApproachIntensity(0);
          audioEngine.current?.setAmbientVolume(0.2);
        }
      },
      () => {
        setLocationMode("denied");
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [ambientUrl, currentStop, isForeground, playerState]);

  useEffect(() => {
    if (
      playerState !== "intro" &&
      playerState !== "introPlayed" &&
      playerState !== "traveling" &&
      playerState !== "approaching" &&
      playerState !== "armed" &&
      playerState !== "playing" &&
      playerState !== "played" &&
      playerState !== "outro" &&
      playerState !== "outroPlayed"
    ) {
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void wakeLock.current.request().then(() => setWakeStatus("Active"));
      }
    };

    void wakeLock.current
      .request()
      .then(() => setWakeStatus(wakeLock.current.supported ? "Active" : "Unsupported"))
      .catch(() => setWakeStatus("Unsupported"));

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [playerState]);

  async function handlePrimary() {
    if (!route || !currentStop) {
      return;
    }

    if (playerState === "preflight") {
      setCacheError("");
      try {
        await cacheRouteAudio(route, setCacheProgress);
        setPlayerState("ready");
      } catch (error) {
        setCacheError(error instanceof Error ? error.message : "Download failed.");
      }
      return;
    }

    if (playerState === "ready") {
      await audioEngine.current?.unlock();
      setAudioStatus("Unlocked");
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const current = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              speedMps: position.coords.speed,
              timestamp: position.timestamp
            };
            lastPositionFix.current = current;
            setCurrentPosition(current);
            setLocationMode("watching");
          },
          () => setLocationMode("denied"),
          { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
        );
      } else {
        setLocationMode("manual");
      }
      await wakeLock.current.request().catch(() => undefined);
      setWakeStatus(wakeLock.current.supported ? "Active" : "Unsupported");
      await playRouteIntro();
      return;
    }

    if (playerState === "intro" || playerState === "outro") {
      toggleNarrationPause();
      return;
    }

    if (playerState === "introPlayed") {
      await playRouteIntro();
      return;
    }

    if (playerState === "armed") {
      await playCurrentStopNarration();
      return;
    }

    if (playerState === "playing") {
      toggleNarrationPause();
      return;
    }

    if (playerState === "played") {
      setRitualMessage("");
      await playCurrentStopNarration();
      return;
    }

    if (playerState === "outroPlayed") {
      await playRouteOutro();
    }
  }

  function toggleNarrationPause() {
    if (narrationPlayback === "paused") {
      if (audioEngine.current?.resumeNarration()) {
        setNarrationPlayback("playing");
      }
    } else if (audioEngine.current?.pauseNarration()) {
      setNarrationPlayback("paused");
    }
  }

  async function playRouteIntro() {
    if (!route) {
      return;
    }

    const token = playbackToken.current;
    await audioEngine.current?.startAmbient(ambientUrl);
    audioEngine.current?.setAmbientVolume(0.2);
    setPlayerState("intro");
    setNarrationPlayback("playing");
    await audioEngine.current?.playNarration(route.introAudio);
    if (token !== playbackToken.current) {
      return;
    }
    setNarrationPlayback("idle");
    setPlayerState("introPlayed");
  }

  function enterDriveAfterIntro() {
    playbackToken.current += 1;
    audioEngine.current?.stopNarration();
    setNarrationPlayback("idle");
    setPlayerState("traveling");
    void audioEngine.current?.startAmbient(ambientUrl);
    audioEngine.current?.setAmbientVolume(0.2);
  }

  function skipRouteIntro() {
    enterDriveAfterIntro();
  }

  async function playRouteOutro() {
    if (!route) {
      return;
    }

    const token = playbackToken.current;
    setPlayerState("outro");
    await audioEngine.current?.startAmbient(ambientUrl);
    audioEngine.current?.setAmbientVolume(0.2);
    setNarrationPlayback("playing");
    await audioEngine.current?.playNarration(route.outroAudio);
    if (token !== playbackToken.current) {
      return;
    }
    setNarrationPlayback("idle");
    setPlayerState("outroPlayed");
  }

  async function closeRouteAfterOutro() {
    if (selectedLoop) {
      setCompletedLoopIds((ids) => (ids.includes(selectedLoop.id) ? ids : [...ids, selectedLoop.id]));
    }
    playbackToken.current += 1;
    audioEngine.current?.stopAll();
    await wakeLock.current.release();
    setWakeStatus("Released");
    setNarrationPlayback("idle");
    setPlayerState("ended");
  }

  async function advanceAfterPlayed() {
    if (!route || !currentStop || playerState !== "played") {
      return;
    }

    if (activeStopIndex === activeStops.length - 1) {
      await playRouteOutro();
      return;
    }

    const nextStop = activeStops[activeStopIndex + 1];
    const legAudio = nextStop ? loopLegByMove.get(`${currentStop.id}->${nextStop.id}`)?.audioFile : null;
    setActiveStopIndex((index) => index + 1);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setRitualMessage("");
    hasAutoArmedStop.current = false;
    setPlayerState("traveling");
    if (legAudio) {
      setNarrationPlayback("playing");
      await audioEngine.current?.playNarration(legAudio);
      setNarrationPlayback("idle");
    }
  }

  async function playCurrentStopNarration() {
    if (!currentStop) {
      return;
    }

    const token = playbackToken.current;
    setPlayerState("playing");
    await audioEngine.current?.startAmbient(ambientUrl);
    audioEngine.current?.setAmbientVolume(0.44);
    setNarrationPlayback("playing");
    await audioEngine.current?.playNarration(currentStop.audio.narrationFile);
    if (token !== playbackToken.current) {
      return;
    }
    setNarrationPlayback("idle");
    setSessionEvents((events) => {
      if (events.some((event) => event.type === "stopCompleted" && event.stopId === currentStop.id)) {
        return events;
      }

      return [
        ...events,
        {
          type: "stopCompleted",
          stopId: currentStop.id,
          stopTitle: currentStop.title,
          timestamp: new Date().toISOString()
        }
      ];
    });
    setPlayerState("played");
  }

  async function armManually() {
    if (!currentStop || !canArmManually) {
      return;
    }

    setApproachIntensity(1);
    hasAutoArmedStop.current = true;
    await playCurrentStopNarration();
  }

  function resetStopContext(nextIndex: number) {
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    setNarrationPlayback("idle");
    setActiveStopIndex(nextIndex);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setRitualMessage("");
    setShareStatus("");
    setCurrentPosition(null);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setIsStopsBoardOpen(false);
    setResumeState(null);
    setPlayerState("traveling");
    void audioEngine.current?.startAmbient(activeStops[nextIndex]?.audio.ambientFile ?? ambientUrl);
    audioEngine.current?.setAmbientVolume(0.2);
  }

  function updateLoopUrl(loopId: string | null, mode: "push" | "replace" = "push") {
    const url = new URL(window.location.href);
    if (loopId) {
      url.searchParams.set("loop", loopId);
    } else {
      url.searchParams.delete("loop");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) {
      return;
    }

    const state = loopId ? { loopId } : { home: true };
    if (mode === "replace") {
      window.history.replaceState(state, "", nextUrl);
    } else {
      window.history.pushState(state, "", nextUrl);
    }
  }

  function requestWelcomeLocation() {
    if (!("geolocation" in navigator)) {
      setWelcomePosition(null);
      setWelcomeLocationStatus("denied");
      return;
    }

    setWelcomeLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speedMps: position.coords.speed,
          timestamp: position.timestamp
        };
        lastPositionFix.current = current;
        setCurrentPosition(current);
        setWelcomePosition(current);
        setLocationMode("watching");
        const distanceFromSaskatoon = haversineMeters(current, saskatoonCenter);
        setWelcomeLocationStatus(distanceFromSaskatoon > saskatoonDistanceCutoffMeters ? "far" : "enabled");
      },
      () => {
        setWelcomePosition(null);
        setWelcomeLocationStatus("denied");
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  }

  function selectLoop(loopId: string, options: { updateUrl?: boolean } = {}) {
    if (loopId === selectedLoop?.id) {
      return;
    }

    if (loopId === "complete-the-city") {
      const confirmed = window.confirm("This is the full ~6 hour marathon across all 39 stops. Start it?");
      if (!confirmed) {
        return;
      }
    }

    if (options.updateUrl !== false) {
      updateLoopUrl(loopId);
    }
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    window.localStorage.setItem(welcomeSeenStorageKey, "true");
    setHasSeenWelcome(true);
    setSelectedLoopId(loopId);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setCurrentPosition(null);
    setRitualMessage("");
    setSkippedStopIds([]);
    setSessionEvents([]);
    setShareStatus("");
    setResumeState(null);
    setIsStopsBoardOpen(false);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    window.localStorage.removeItem(resumeStorageKey);
    if (playerState !== "preflight") {
      setPlayerState("ready");
    }
  }

  function switchLoopMidDrive(loopId: string) {
    if (!route || loopId === selectedLoop?.id) {
      return;
    }

    const nextLoop = route.loops?.find((loop) => loop.id === loopId);
    if (!nextLoop) {
      return;
    }

    const confirmed = window.confirm(`Leave ${selectedLoop?.title ?? "this loop"} and start ${nextLoop.title}? Current loop progress will be cleared.`);
    if (!confirmed) {
      return;
    }

    updateLoopUrl(loopId);
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    setSelectedLoopId(loopId);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setCurrentPosition(null);
    setRitualMessage("");
    setSkippedStopIds([]);
    setSessionEvents([]);
    setShareStatus("");
    setResumeState(null);
    setIsStopsBoardOpen(false);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setPlayerState("traveling");
    const nextStop = nextLoop.stopIds.map((id) => stopById.get(id)).find((stop): stop is Stop => Boolean(stop));
    void audioEngine.current?.startAmbient(nextStop?.audio.ambientFile ?? ambientUrl);
    audioEngine.current?.setAmbientVolume(0.2);
  }

  function startAnotherLoop() {
    if (!nextUnfinishedLoop) {
      return;
    }

    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    updateLoopUrl(nextUnfinishedLoop.id);
    setSelectedLoopId(nextUnfinishedLoop.id);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setCurrentPosition(null);
    setRitualMessage("");
    setSkippedStopIds([]);
    setSessionEvents([]);
    setShareStatus("");
    setResumeState(null);
    setIsStopsBoardOpen(false);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    window.localStorage.removeItem(resumeStorageKey);
    setPlayerState("ready");
  }

  async function returnHome(options: { updateUrl?: boolean } = {}) {
    if (options.updateUrl !== false) {
      updateLoopUrl(null);
    }
    playbackToken.current += 1;
    audioEngine.current?.stopAll();
    await wakeLock.current.release();
    setWakeStatus("Released");
    setNarrationPlayback("idle");
    setSelectedLoopId(null);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setCurrentPosition(null);
    setLocationMode("unknown");
    setRitualMessage("");
    setSkippedStopIds([]);
    setSessionEvents([]);
    setShareStatus("");
    setResumeState(null);
    setIsStopsBoardOpen(false);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setPlayerState("preflight");
  }

  function skipCurrentStop() {
    if (!route || !currentStop || activeStopIndex >= activeStops.length - 1) {
      return;
    }

    if (!completedStopIds.has(currentStop.id)) {
      setSkippedStopIds((ids) => (ids.includes(currentStop.id) ? ids : [...ids, currentStop.id]));
    }
    resetStopContext(activeStopIndex + 1);
  }

  function jumpToStop(index: number) {
    if (!activeStops[index]) {
      return;
    }

    resetStopContext(index);
  }

  function resumeDrive() {
    if (!route || !resumeState) {
      return;
    }

    if (resumeState.loopId) {
      const resumeLoop = route.loops?.find((loop) => loop.id === resumeState.loopId);
      const resumeStops = resumeLoop
        ? resumeLoop.stopIds.map((id) => stopById.get(id)).filter((stop): stop is Stop => Boolean(stop))
        : route.stops;
      if (!resumeStops[resumeState.activeStopIndex]) {
        return;
      }
      setSelectedLoopId(resumeState.loopId);
    } else if (!activeStops[resumeState.activeStopIndex]) {
      return;
    }

    setSkippedStopIds(resumeState.skippedStopIds);
    setSessionEvents(resumeState.sessionEvents);
    setCompletedLoopIds(resumeState.completedLoopIds ?? []);
    resetStopContext(resumeState.activeStopIndex);
  }

  function resetDemo() {
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    setCurrentPosition(null);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setRitualMessage("");
    setSessionEvents([]);
    setSkippedStopIds([]);
    setCompletedLoopIds([]);
    setResumeState(null);
    setShareStatus("");
    window.localStorage.removeItem(resumeStorageKey);
    setPlayerState("ready");
  }

  async function triggerRitual(ritual: NonNullable<Stop["rituals"]>[number]) {
    if (!currentStop) {
      return;
    }

    setRitualMessage(ritual.instructionText);
    const token = playbackToken.current;
    if (ritual.cueAudio) {
      setNarrationPlayback("playing");
      await audioEngine.current?.playNarration(ritual.cueAudio);
      if (token !== playbackToken.current) {
        return;
      }
      setNarrationPlayback("idle");
    }
    const payoffFired = Boolean(ritual.payoff && Math.random() <= ritual.payoff.probability);

    if (payoffFired && ritual.payoff) {
      await new Promise((resolve) => window.setTimeout(resolve, ritual.payoff?.delayMs ?? 0));
      if (token !== playbackToken.current) {
        return;
      }
      await audioEngine.current?.playEffect(ritual.payoff.audioFile, 0.34);
    }

    setSessionEvents((events) => [
      ...events,
      {
        type: "ritual",
        stopId: currentStop.id,
        stopTitle: currentStop.title,
        ritualId: ritual.id,
        ritualLabel: ritual.label,
        payoffFired,
        timestamp: new Date().toISOString()
      }
    ]);
  }

  async function shareRecap() {
    const featuredLine = stats.featured
      ? stats.featured.type === "ritual" && stats.featured.payoffFired
        ? `${stats.featured.stopTitle} answered at ${localTime(stats.featured.timestamp)}.`
        : `${stats.featured.stopTitle} opened at ${localTime(stats.featured.timestamp)}.`
      : "The route closed without a witness.";
    const text = `I survived Dark Drives. ${stats.completedStops.length} stops opened. ${stats.rituals.length} rituals performed. ${stats.answered.length} answered back. ${featuredLine} #DarkDrives`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0a0908"/>
<rect x="46" y="46" width="1108" height="538" fill="none" stroke="#3a352f" stroke-width="3"/>
<text x="82" y="132" fill="#b3000f" font-family="Impact, Arial Black, sans-serif" font-size="78">YOU SURVIVED</text>
<text x="86" y="190" fill="#e6e1d6" font-family="Arial, sans-serif" font-size="34">The Dark Side of Saskatoon</text>
<text x="86" y="292" fill="#72ff57" font-family="Consolas, monospace" font-size="42">${stats.completedStops.length} STOPS OPENED</text>
<text x="86" y="356" fill="#e6e1d6" font-family="Consolas, monospace" font-size="34">${stats.rituals.length} RITUALS PERFORMED</text>
<text x="86" y="412" fill="#e6e1d6" font-family="Consolas, monospace" font-size="34">${stats.answered.length} ANSWERED BACK</text>
<text x="86" y="500" fill="#a39d92" font-family="Arial, sans-serif" font-size="30">${featuredLine.replace(/[<&>]/g, "")}</text>
<text x="86" y="552" fill="#b3000f" font-family="Consolas, monospace" font-size="28">#DarkDrives</text>
</svg>`;

    const file = new File([new Blob([svg], { type: "image/svg+xml" })], "dark-drives-recap.svg", { type: "image/svg+xml" });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "I survived Dark Drives", text, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: "I survived Dark Drives", text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("Recap copied.");
        return;
      }
      setShareStatus("Share sheet opened.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setShareStatus("Share cancelled.");
      } else {
        setShareStatus("Share unavailable.");
      }
    }
  }

  return (
    <main className="shell">
      <div className="phone">
        <section ref={screenRef} className={screenClassName} aria-label="Dark Drives route player">
          <header className="topbar">
            <button className="brand" type="button" onClick={() => void returnHome()} aria-label="Return to Choose Night">
              <div className="wordmark" aria-label="Dark Drives">
                Dark Drives<sup>TM</sup>
              </div>
              <h1 className="title">{route?.title ?? "Loading route"}</h1>
            </button>
            <span className="status-pill">{statusLabel}</span>
          </header>

          {!route ? (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">ROUTE PACK</span>
                <span className="sealed">{routeError ? "LOCKED" : "LOADING"}</span>
              </div>
              <h2>{routeError || "Loading your city pack"}</h2>
              <p>The player only loads full route data after the server verifies access.</p>
            </div>
          ) : resumeState && isPreDrive ? (
            <div className="panel resume-panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">SESSION FOUND</span>
                <span className="sealed">{route.stops[resumeState.activeStopIndex]?.title ?? "Saved drive"}</span>
              </div>
              <h2>Resume your drive</h2>
              <p>Saved at {localTime(resumeState.savedAt)}. Route access is still checked by the server.</p>
              <button className="small-button" onClick={resumeDrive}>Resume</button>
            </div>
          ) : !hasCheckedResume && isPreDrive ? (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">SESSION CHECK</span>
                <span className="sealed">WAIT</span>
              </div>
              <h2>Checking the car</h2>
              <p>Looking for an unfinished drive before opening a new night.</p>
            </div>
          ) : isChoosingLoop ? (
            <div className="welcome-screen" aria-label="Choose your night">
              {!hasSeenWelcome && (
                <div className="welcome-intro">
                  <span className="stop-count">Choose your night</span>
                  <h2>Dark Drives is a haunted route you run from the car after dark.</h2>
                  <p>One person drives with their own maps. One person holds this phone and becomes the host.</p>
                </div>
              )}
              {hasSeenWelcome && (
                <div className="welcome-intro compact">
                  <span className="stop-count">Choose your night</span>
                  <h2>Pick the loop for tonight.</h2>
                </div>
              )}
              <div className="closest-loop-row">
                <button
                  className="location-link"
                  disabled={welcomeLocationStatus === "requesting"}
                  onClick={requestWelcomeLocation}
                  type="button"
                >
                  {welcomeLocationStatus === "requesting" ? "Checking your closest loop..." : "Show me the closest loop"}
                </button>
                {welcomeLocationStatus === "enabled" && <span>Approximate distance to each first stop.</span>}
                {welcomeLocationStatus === "denied" && <span>Location skipped. The start areas below still work.</span>}
                {welcomeLocationStatus === "far" && <span>You do not look near Saskatoon. Showing start areas instead.</span>}
              </div>
              <div className="welcome-loop-list">
                {welcomeLoops.map((loop) => (
                  <a
                    className="welcome-loop-card"
                    data-closest={loop.isClosest}
                    data-marathon={loop.isMarathon}
                    href={loopHref(loop.id)}
                    key={loop.id}
                    onClick={(event) => {
                      event.preventDefault();
                      selectLoop(loop.id);
                    }}
                  >
                    <div className="welcome-loop-title">
                      <strong>{loop.title}</strong>
                      {loop.isClosest && <span>Closest</span>}
                      {loop.isMarathon && <span>Marathon</span>}
                    </div>
                    <span>{loop.subtitle}</span>
                    <span>Starts {loop.startNeighborhood}: {loop.startStop?.title ?? "first live stop"}</span>
                    <span>Covers {loop.coverage}</span>
                    <em>{loop.estimatedDuration} / finale: {loopFinaleTitle(loop)}</em>
                    {loop.distanceMeters !== null && welcomeLocationStatus === "enabled" && (
                      <em>First stop about {formatApproxDistance(loop.distanceMeters)} away, straight line</em>
                    )}
                    {loop.isMarathon && <em>Marathon, all 39 stops, a serious commitment</em>}
                  </a>
                ))}
              </div>
            </div>
          ) : !currentStop ? (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">ROUTE LOOP</span>
                <span className="sealed">EMPTY</span>
              </div>
              <h2>Loop unavailable</h2>
              <p>Choose a different night from the route loop screen.</p>
            </div>
          ) : (
            <>
          {route.loops && route.loops.length > 0 && isPreDrive && (
            <div className="panel loop-panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">ROUTE LOOP</span>
                <span className="sealed">{selectedLoop?.estimatedDuration ?? "Choose"}</span>
              </div>
              {!isLoopPickerOpen && selectedLoop ? (
                <div className="loop-summary">
                  <div>
                    <strong>{selectedLoop.title}</strong>
                    <span>{selectedLoop.subtitle}</span>
                    <em>
                      <span>{selectedLoopLiveCount} live stop{selectedLoopLiveCount === 1 ? "" : "s"} · {selectedLoop.estimatedDuration}</span>
                      <span>finale: {selectedLoopFinale}</span>
                    </em>
                  </div>
                  <button className="small-button" onClick={() => setIsLoopPickerOpen(true)}>Change loop</button>
                </div>
              ) : (
                <div className="loop-list">
                  {route.loops.map((loop) => {
                    const liveCount = loop.stopIds.filter((id) => stopById.has(id)).length;
                    const heldCount = loop.stopIds.length - liveCount;
                    const selected = loop.id === selectedLoop?.id;
                    const completed = completedLoopIdSet.has(loop.id);

                    return (
                      <button className="loop-button" data-selected={selected} key={loop.id} onClick={() => selectLoop(loop.id)}>
                        <strong>{loop.title}</strong>
                        <span>{loop.subtitle}</span>
                        <em>{completed ? "completed · " : ""}{liveCount} live{heldCount > 0 ? ` / ${heldCount} sealed` : ""}</em>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedLoopHeldCount > 0 && (
                <details className="sealed-disclosure">
                  <summary>
                    {selectedLoopHeldCount} more stop{selectedLoopHeldCount === 1 ? "" : "s"} on this loop, locked until safe parking is confirmed
                  </summary>
                  <div className="sealed-list">
                    {selectedLoopSealedStops.map((sealedStop) => (
                      <details className="sealed-stop-detail" key={sealedStop.id}>
                        <summary>
                          <span>{String(sealedStop.order).padStart(2, "0")}</span>
                          <strong>{sealedStop.title}</strong>
                          <em>locked, needs parking</em>
                        </summary>
                        <p>{sealedStop.reason}</p>
                        {sealedStop.safetyNote && <p>{sealedStop.safetyNote}</p>}
                      </details>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="hero">
            <span className="stop-count">
              {selectedLoop?.title ?? "Route"} / Stop {activeStopIndex + 1} of {activeStops.length}
            </span>
            <h2 className="stop-name">{currentStop.title}</h2>
            <div className="presence" data-state={playerState}>
              <span className="presence-dot" aria-hidden />
              <span>{presenceCopy(playerState, distanceMeters, narrationPlayback)}</span>
            </div>
          </div>

          <button className={`primary ${primary.className}`} disabled={primary.disabled} onClick={handlePrimary}>
            {primary.label}
          </button>

          <div className="secondary-row">
            <button className="secondary" onClick={() => window.open(mapsUrl(currentStop), "_blank", "noopener,noreferrer")}>
              Drive There
            </button>
            <button className="secondary" onClick={() => setIsStopsBoardOpen((open) => !open)}>
              Stops
            </button>
            {!isPreDrive && (
              <>
                {playerState === "intro" ? (
                  <button className="secondary" onClick={skipRouteIntro}>
                    Skip Intro
                  </button>
                ) : playerState === "introPlayed" ? (
                  <button className="secondary" onClick={enterDriveAfterIntro}>
                    Start Drive
                  </button>
                ) : playerState === "played" ? (
                  <button className="secondary" onClick={() => void advanceAfterPlayed()}>
                    {activeStopIndex === activeStops.length - 1 ? "Close Route" : "Next File"}
                  </button>
                ) : playerState === "outroPlayed" ? (
                  <button className="secondary" onClick={() => void closeRouteAfterOutro()}>
                    Close Route
                  </button>
                ) : playerState === "outro" ? null : (
                  <>
                    <button className="secondary" onClick={() => void armManually()} disabled={!canArmManually}>
                      I&apos;m Here
                    </button>
                    <button className="secondary" onClick={skipCurrentStop} disabled={!canSkip}>
                      Skip
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {isStopsBoardOpen && (
            <div className="panel stops-board" aria-label="Stops board">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">STOPS BOARD</span>
                <span className="sealed">{stats.completedStops.length}/{activeStops.length} DONE</span>
              </div>
              <div className="stops-list">
                {activeStops.map((stop, index) => {
                  const isCurrent = index === activeStopIndex;
                  const isCompleted = completedStopIds.has(stop.id);
                  const isSkipped = skippedStopIdSet.has(stop.id) && !isCompleted;
                  const status = isCurrent ? "current" : isCompleted ? "done" : isSkipped ? "skipped" : "upcoming";

                  return (
                    <button className="stop-row" data-status={status} key={stop.id} onClick={() => jumpToStop(index)}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{stop.title}</strong>
                      <em>{status}</em>
                    </button>
                  );
                })}
                {selectedLoopSealedStops.map((sealedStop) => (
                  <div className="stop-row stop-row-locked" data-status="sealed" key={sealedStop.id}>
                    <span>{String(sealedStop.order).padStart(2, "0")}</span>
                    <strong>{sealedStop.title}</strong>
                    <em>sealed</em>
                  </div>
                ))}
              </div>
              {!isPreDrive && route.loops && route.loops.length > 1 && (
                <details className="loop-switcher">
                  <summary>Change loop</summary>
                  <div className="loop-switch-list">
                    {route.loops.filter((loop) => loop.id !== selectedLoop?.id).map((loop) => (
                      <button className="stop-row loop-switch-row" key={loop.id} onClick={() => switchLoopMidDrive(loop.id)}>
                        <span>{completedLoopIdSet.has(loop.id) ? "DONE" : "LOOP"}</span>
                        <strong>{loop.title}</strong>
                        <em>start over</em>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {currentStop.rituals && (playerState === "armed" || playerState === "playing" || playerState === "played") && (
            <div className="ritual-panel" aria-label="Ritual actions">
              <span className="tiny">Ritual</span>
              {currentStop.rituals.map((ritual) => (
                <button className="ritual-button" key={ritual.id} onClick={() => void triggerRitual(ritual)}>
                  {ritual.label}
                </button>
              ))}
              {ritualMessage && <p>{ritualMessage}</p>}
            </div>
          )}

          {isDriveActive && narrationPlayback !== "idle" && (
            <div className="signal-meter drive-signal" data-paused={narrationPlayback === "paused"} aria-label="Narration signal">
              {Array.from({ length: 24 }, (_, index) => (
                <span key={index} style={{ height: `${22 + ((index * 19) % 74)}%` }} />
              ))}
            </div>
          )}

          {playerState !== "preflight" && (
            <details className="map-drawer">
              <summary>Route signal</summary>
              <RouteMap stops={activeStops} activeStopIndex={activeStopIndex} currentPosition={currentPosition} />
            </details>
          )}

          {playerState === "preflight" && (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">FILE 01</span>
                <span className="sealed">SEALED</span>
              </div>
              <h2>Preparing your haunting</h2>
              <div className="progress-track" aria-label="Download progress">
                <div className="progress-bar" style={{ width: `${cacheProgress.percent}%` }} />
              </div>
              <p>
                {cacheProgress.percent}% cached. All route audio is downloaded before the drive starts, then played from Cache API storage.
              </p>
              <p className="cache-current" aria-live="polite">
                {cacheProgress.currentUrl && cacheProgress.percent < 100 ? `Downloading ${cacheProgress.currentUrl}` : ""}
              </p>
              <p>Location is requested on Begin Drive so the app can arm stops while foregrounded. If it is off, every stop still works by hand.</p>
              {cacheError && <p className="cache-error">{cacheError}</p>}
            </div>
          )}

          {playerState !== "preflight" && (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">{playerState === "ready" ? "START HERE" : `STOP ${String(activeStopIndex + 1).padStart(2, "0")}`}</span>
                <span className="sealed">{playerState === "ready" ? "READY" : playerState === "armed" ? "OPENING" : playerState === "playing" ? "ON AIR" : "OPEN"}</span>
              </div>
              <h2>{playerState === "ready" ? currentStop.title : stateCopy(playerState)}</h2>
              {playerState === "ready" && <p>{currentStop.story.teaser}</p>}
              {locationMode === "denied" && <p>Location is off. You will arm each stop yourself.</p>}
              <p className="safety-line">{currentStop.safetyNote}</p>
              <details className="read-disclosure">
                <summary>Read it</summary>
                <p>{currentStop.story.body}</p>
              </details>
            </div>
          )}

          <details className="diagnostics">
            <summary>Diagnostics</summary>
            <div className="feed">
              <div className="feed-row">
                <span>Audio</span>
                <strong>{audioStatus}</strong>
              </div>
              <div className="feed-row">
                <span>Cache</span>
                <strong>{cacheProgress.percent === 100 ? "Ready offline" : `${cacheProgress.percent}%`}</strong>
              </div>
              <div className="feed-row">
                <span>Location</span>
                <strong>{locationMode === "denied" ? "Manual mode" : locationMode}</strong>
              </div>
              <div className="feed-row">
                <span>Arm radius</span>
                <strong>{effectiveArriveRadius ? `${effectiveArriveRadius}m` : `${currentStop.arriveRadiusM}m`}</strong>
              </div>
              <div className="feed-row">
                <span>Wake lock</span>
                <strong>{wakeStatus}</strong>
              </div>
              <div className="feed-row">
                <span>Sealed files</span>
                <strong>{selectedLoopSealedStops.length}</strong>
              </div>
              {playerState === "ended" && <button className="small-button" onClick={resetDemo}>Reset demo</button>}
            </div>
          </details>
          {playerState === "ended" && (
            <div className="panel recap-panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">SURVIVAL FILE</span>
                <span className="sealed">{stats.answered.length} ANSWERED</span>
              </div>
              <h2>You survived</h2>
              <div className="recap-grid">
                <div>
                  <span>Stops opened</span>
                  <strong>{stats.completedStops.length}</strong>
                </div>
                <div>
                  <span>Rituals</span>
                  <strong>{stats.rituals.length}</strong>
                </div>
                <div>
                  <span>Answered back</span>
                  <strong>{stats.answered.length}</strong>
                </div>
              </div>
              {stats.featured && (
                <p>
                  {stats.featured.type === "ritual" && stats.featured.payoffFired
                    ? `${stats.featured.stopTitle} answered you at ${localTime(stats.featured.timestamp)}.`
                    : `${stats.featured.stopTitle} opened at ${localTime(stats.featured.timestamp)}.`}
                </p>
              )}
              <button className="small-button" onClick={() => void shareRecap()}>Share recap</button>
              {nextUnfinishedLoop && (
                <div className="next-loop-panel">
                  <p>
                    {loopsLeftTonight} loop{loopsLeftTonight === 1 ? "" : "s"} left tonight.
                  </p>
                  <button className="small-button" onClick={startAnotherLoop}>
                    Start {nextUnfinishedLoop.title}
                  </button>
                </div>
              )}
              {shareStatus && <p>{shareStatus}</p>}
            </div>
          )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
