"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, LocateFixed, Navigation, Play } from "lucide-react";
import { cacheRouteAudio, isRouteCached, type CacheProgress } from "@/lib/audio-cache";
import { DarkDrivesAudioEngine } from "@/lib/audio-engine";
import type { PlaybackProgress } from "@/lib/audio-engine";
import { LEGAL_VERSION, legalAcceptanceStorageKey, legalAcknowledgmentPoints, legalDocuments } from "@/lib/legal";
import type { LegalAcceptance } from "@/lib/legal";
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
type RitualPlayback = "idle" | "playing" | "played";
type LegalStatus = "checking" | "accepted" | "blocked";
type ImHereState = "enroute" | "arrived";
type StopStatus = "approaching" | "ready" | "playing" | "paused" | "complete";
const ROUTE_NARRATION_VOLUME = 1.45;
const activeDriveStates: PlayerState[] = ["intro", "traveling", "approaching", "armed", "playing", "played", "outro", "outroPlayed"];
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
  area: string;
  coverage: string;
  finale: string;
  loopNumber: number;
  startNeighborhood: string;
  startStop: Stop | null;
  startText: string;
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
  if (playerState === "intro") return "Playing";
  if (playerState === "introPlayed") return "Ready";
  if (playerState === "traveling" || playerState === "approaching") return "Approaching";
  if (playerState === "armed") return "Ready";
  if (playerState === "playing") return "Playing";
  if (playerState === "played") return "Complete";
  if (playerState === "outro") return "Playing";
  if (playerState === "outroPlayed") return "Final heard";
  return "Tour complete";
}

function stopStatusFor(playerState: PlayerState, narrationPlayback: NarrationPlayback): StopStatus {
  if (playerState === "played" || playerState === "outroPlayed") return "complete";
  if ((playerState === "playing" || playerState === "outro") && narrationPlayback === "paused") return "paused";
  if (playerState === "playing" || playerState === "outro") return "playing";
  if (playerState === "armed") return "ready";
  return "approaching";
}

function stopStatusLabel(status: StopStatus) {
  if (status === "ready") return "Ready";
  if (status === "playing") return "Playing";
  if (status === "paused") return "Paused";
  if (status === "complete") return "Complete";
  return "Approaching";
}

function localTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function formatClipTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function cacheFilename(url?: string) {
  if (!url) {
    return "";
  }

  const path = url.split(/[?#]/, 1)[0];
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function isCurrentLegalAcceptance(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as Partial<LegalAcceptance>;
    return parsed.version === LEGAL_VERSION && typeof parsed.acceptedAt === "string";
  } catch {
    return false;
  }
}

function playLegalAcceptSting() {
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    const context = new AudioContextConstructor();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const low = context.createOscillator();
    const high = context.createOscillator();
    const now = context.currentTime;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(980, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 2.8);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.065, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    low.type = "triangle";
    high.type = "sine";
    low.frequency.setValueAtTime(146.83, now);
    low.frequency.exponentialRampToValueAtTime(130.81, now + 2.8);
    high.frequency.setValueAtTime(220, now);
    high.frequency.exponentialRampToValueAtTime(196, now + 2.8);

    low.connect(filter);
    high.connect(filter);
    filter.connect(master);
    master.connect(context.destination);
    low.start(now);
    high.start(now + 0.18);
    low.stop(now + 2.9);
    high.stop(now + 2.9);
    window.setTimeout(() => void context.close(), 3200);
  } catch {
    // The sting is tone only. Entering the app must never depend on audio support.
  }
}

function reviewUrl() {
  const subject = encodeURIComponent("Dark Drives review");
  const body = encodeURIComponent("Tour:\nRating:\nWhat worked:\nWhat was confusing:\n");
  return `mailto:reviews@darkdrives.app?subject=${subject}&body=${body}`;
}

function LegalDocument({ document }: { document: typeof legalDocuments.terms }) {
  return (
    <div className="legal-document">
      <strong>{document.title}</strong>
      <em>{document.note}</em>
      {document.sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

function LegalDocuments() {
  return (
    <div className="legal-documents" aria-label="Legal documents">
      <details>
        <summary>Terms of Use</summary>
        <LegalDocument document={legalDocuments.terms} />
      </details>
      <details>
        <summary>Privacy Policy</summary>
        <LegalDocument document={legalDocuments.privacy} />
      </details>
    </div>
  );
}

function LegalGate({
  accepted,
  onAcceptedChange,
  onAccept
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onAccept: () => void;
}) {
  return (
    <div className="legal-gate" aria-label="Legal acknowledgment">
      <span className="stop-count">Before you drive</span>
      <h2>Read this before you start.</h2>
      <p>This is a self-guided audio experience that sends you to real locations.</p>
      <div className="legal-points">
        {legalAcknowledgmentPoints.map((point, index) => (
          <div className="legal-point" key={point.title}>
            <strong>{index + 1} {point.title}</strong>
            <p>{point.body}</p>
          </div>
        ))}
      </div>
      <LegalDocuments />
      <label className="legal-check">
        <input checked={accepted} onChange={(event) => onAcceptedChange(event.target.checked)} type="checkbox" />
        <span>I have read and accept the above, the Terms of Use, and the Privacy Policy.</span>
      </label>
      <button className="primary ready" disabled={!accepted} onClick={onAccept}>
        Accept and Continue
      </button>
    </div>
  );
}

function PlaybackSignal({
  label,
  paused = false,
  progress,
  variant = "drive",
  bars = 24,
  onSeek
}: {
  label: string;
  paused?: boolean;
  progress: PlaybackProgress | null;
  variant?: "drive" | "ritual";
  bars?: number;
  onSeek?: (position: number) => void;
}) {
  const percent = progress?.percent ?? 0;
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!progress || !onSeek) {
      return;
    }

    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const nextPercent = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    onSeek(nextPercent * progress.duration);
  };

  return (
    <div className={`playback-signal ${variant === "ritual" ? "ritual-playback" : "drive-playback"}`} data-paused={paused}>
      <div
        className="playback-progress"
        role={onSeek ? "slider" : undefined}
        aria-label={`${label} progress`}
        aria-valuemin={onSeek ? 0 : undefined}
        aria-valuemax={onSeek && progress ? Math.round(progress.duration) : undefined}
        aria-valuenow={onSeek && progress ? Math.round(progress.position) : undefined}
        tabIndex={onSeek ? 0 : undefined}
        onPointerDown={seekFromPointer}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            seekFromPointer(event);
          }
        }}
        onKeyDown={(event) => {
          if (!progress || !onSeek) {
            return;
          }

          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const delta = event.key === "ArrowRight" ? 5 : -5;
            onSeek(clamp(progress.position + delta, 0, progress.duration));
          }
        }}
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className={`signal-meter ${variant === "ritual" ? "ritual-signal" : "drive-signal"}`} data-paused={paused} aria-label={label}>
        {Array.from({ length: bars }, (_, index) => (
          <span key={index} style={{ height: `${variant === "ritual" ? 26 + ((index * 23) % 68) : 22 + ((index * 19) % 74)}%` }} />
        ))}
      </div>
      {paused && progress && (
        <div className="playback-time">
          {formatClipTime(progress.position)} / {formatClipTime(progress.duration)}
        </div>
      )}
    </div>
  );
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
  const [legalStatus, setLegalStatus] = useState<LegalStatus>("checking");
  const [hasCheckedLegal, setHasCheckedLegal] = useState(false);
  const [legalCheckboxAccepted, setLegalCheckboxAccepted] = useState(false);
  const [route, setRoute] = useState<RoutePack | null>(null);
  const [routeError, setRouteError] = useState("");
  const [playerState, setPlayerState] = useState<PlayerState>("preflight");
  const [cacheProgress, setCacheProgress] = useState<CacheProgress>({ complete: 0, total: 0, percent: 0 });
  const [cacheError, setCacheError] = useState("");
  const [isPreparingRoute, setIsPreparingRoute] = useState(false);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [effectiveArriveRadius, setEffectiveArriveRadius] = useState<number | null>(null);
  const [approachIntensity, setApproachIntensity] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<PositionFix | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("unknown");
  const [audioStatus, setAudioStatus] = useState("Locked");
  const [wakeStatus, setWakeStatus] = useState("Not requested");
  const [narrationPlayback, setNarrationPlayback] = useState<NarrationPlayback>("idle");
  const [ritualPlayback, setRitualPlayback] = useState<RitualPlayback>("idle");
  const [narrationProgress, setNarrationProgress] = useState<PlaybackProgress | null>(null);
  const [ritualProgress, setRitualProgress] = useState<PlaybackProgress | null>(null);
  const [activeRitualId, setActiveRitualId] = useState<string | null>(null);
  const [isForeground, setIsForeground] = useState(true);
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
  const [welcomeActiveLoopIndex, setWelcomeActiveLoopIndex] = useState(0);
  const [welcomeFlashLoopName, setWelcomeFlashLoopName] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [pendingSkipStopId, setPendingSkipStopId] = useState<string | null>(null);
  const audioEngine = useRef<DarkDrivesAudioEngine | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const wakeLock = useRef(createWakeLockHandle());
  const welcomeScroller = useRef<HTMLDivElement | null>(null);
  const welcomeCards = useRef<Array<HTMLAnchorElement | null>>([]);
  const welcomeAnimationFrame = useRef<number | null>(null);
  const welcomeActiveLoopIndexRef = useRef(0);
  const welcomeSelectTimer = useRef<number | null>(null);
  const playbackToken = useRef(0);
  const ritualPlaybackToken = useRef(0);
  const lastLocationUpdate = useRef(0);
  const lastPositionFix = useRef<PositionFix | null>(null);
  const arrivalFixCount = useRef(0);
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
  const isPreDrive = playerState === "preflight" || playerState === "ready" || playerState === "introPlayed";
  const isLoopLanding = playerState === "preflight" || playerState === "ready" || playerState === "intro" || playerState === "introPlayed";
  const isStopPage = !isLoopLanding;
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
    (playerState === "traveling" || playerState === "approaching" || playerState === "armed" || playerState === "playing" || playerState === "played")
  );
  const needsSkipConfirm = playerState === "playing" && narrationPlayback !== "idle";
  const canArmManually = Boolean(
    route &&
    currentStop &&
    (playerState === "traveling" || playerState === "approaching" || playerState === "armed")
  );
  const skipLabel = needsSkipConfirm && pendingSkipStopId === currentStop?.id ? "Confirm Skip" : "Skip";
  const stopStatus = stopStatusFor(playerState, narrationPlayback);
  const imHereState: ImHereState = stopStatus === "approaching" ? "enroute" : "arrived";
  const screenClassName = ["screen", isStopPage && isDriveActive ? "drive-active" : ""].filter(Boolean).join(" ");
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
    const campus = realLoops.find((loop) => loop.id === "campus-after-dark");
    const others = realLoops.filter((loop) => loop.id !== "campus-after-dark");
    const ordered = campus ? [campus, ...others] : realLoops;
    const closestLoop = welcomeLocationStatus === "enabled"
      ? ordered.reduce<(typeof ordered)[number] | null>((closest, loop) => {
        if (loop.distanceMeters === null) {
          return closest;
        }

        if (!closest || loop.distanceMeters < (closest.distanceMeters ?? Number.POSITIVE_INFINITY)) {
          return loop;
        }

        return closest;
      }, null)
      : null;
    const closestId = closestLoop?.id ?? null;
    const pinned = marathon ? [...ordered, marathon] : ordered;
    return pinned.map((loop, index) => ({
      ...loop,
      area: loop.coverage,
      finale: loopFinaleTitle(loop),
      loopNumber: index + 1,
      startText: `${loop.startNeighborhood}: ${loop.startStop?.title ?? "first live stop"}`,
      isClosest: loop.id === closestId
    }));
  }, [route?.loops, stopById, welcomeLocationStatus, welcomePosition]);
  const completedLoopIdSet = useMemo(() => new Set(completedLoopIds), [completedLoopIds]);
  const nextUnfinishedLoop = authoredLoops.find((loop) => !completedLoopIdSet.has(loop.id));
  const loopsLeftTonight = authoredLoops.filter((loop) => !completedLoopIdSet.has(loop.id)).length;
  const isPrepared = cacheProgress.percent === 100;
  const hasStartedRoutePrep = isPreparingRoute || cacheProgress.complete > 0 || cacheProgress.percent > 0 || Boolean(cacheProgress.currentUrl) || Boolean(cacheError);
  const cacheStatusText = isPrepared ? "Ready offline" : hasStartedRoutePrep ? `${cacheProgress.percent}%` : "Not started";
  const statusLabel = !route
    ? routeError ? "Locked" : "Loading"
    : resumeState && isPreDrive ? "Resume"
      : !hasCheckedResume && isPreDrive ? "Checking"
        : isChoosingLoop ? "Choose Night"
          : isStopPage ? stopStatusLabel(stopStatus) : stateCopy(playerState);

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
    return () => {
      if (welcomeSelectTimer.current !== null) {
        window.clearTimeout(welcomeSelectTimer.current);
      }
      if (welcomeAnimationFrame.current !== null) {
        window.cancelAnimationFrame(welcomeAnimationFrame.current);
      }
    };
  }, []);

  useEffect(() => {
    setWelcomeActiveLoopIndex(0);
    welcomeActiveLoopIndexRef.current = 0;
    welcomeScroller.current?.scrollTo({ top: 0, behavior: "auto" });
    welcomeCards.current = welcomeCards.current.slice(0, welcomeLoops.length);
    window.requestAnimationFrame(updateWelcomeFocus);
  }, [welcomeLoops.map((loop) => loop.id).join("|")]);

  useEffect(() => {
    if (welcomeLocationStatus !== "enabled") {
      return;
    }

    const closestIndex = welcomeLoops.findIndex((loop) => loop.isClosest);
    if (closestIndex >= 0) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      welcomeCards.current[closestIndex]?.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
      window.requestAnimationFrame(updateWelcomeFocus);
    }
  }, [welcomeLocationStatus, welcomeLoops]);

  useEffect(() => {
    const accepted = isCurrentLegalAcceptance(window.localStorage.getItem(legalAcceptanceStorageKey));
    setLegalStatus(accepted ? "accepted" : "blocked");
    setHasCheckedLegal(true);
  }, []);

  useEffect(() => {
    if (legalStatus !== "accepted") {
      return;
    }

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
        const cached = await isRouteCached(data);
        if (active) {
          if (cached) {
            setCacheProgress({ complete: 1, total: 1, percent: 100 });
            setPlayerState("ready");
          }
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
  }, [legalStatus]);

  const primary = useMemo(() => {
    if (!route) return { label: "Loading Route", disabled: true, className: "" };
    if (playerState === "preflight" && isPreparingRoute) return { label: `Preparing ${cacheProgress.percent}%`, disabled: true, className: "preparing" };
    if (playerState === "preflight" && cacheError) return { label: "Retry", disabled: false, className: "" };
    if (playerState === "preflight") return { label: "Prepare Route", disabled: false, className: "" };
    if (playerState === "ready") return { label: "Play Introduction", disabled: false, className: "ready" };
    if (playerState === "intro" || playerState === "outro") {
      return {
        label: narrationPlayback === "paused" ? "Resume" : "Pause",
        disabled: false,
        className: narrationPlayback === "paused" ? "paused" : "playing"
      };
    }
    if (playerState === "introPlayed") return { label: "Begin Drive", disabled: false, className: "ready" };
    if (playerState === "outroPlayed") return { label: "Replay", disabled: false, className: "replay" };
    if (playerState === "traveling") return { label: "Keep Driving", disabled: true, className: "" };
    if (playerState === "approaching") return { label: "Keep Driving", disabled: true, className: "approaching" };
    if (playerState === "armed") return { label: "Start Story", disabled: false, className: "ready" };
    if (playerState === "playing") {
      return {
        label: narrationPlayback === "paused" ? "Resume" : "Pause",
        disabled: false,
        className: narrationPlayback === "paused" ? "paused" : "playing"
      };
    }
    if (playerState === "played") return { label: "Replay", disabled: false, className: "replay" };
    return { label: "Tour Complete", disabled: true, className: "" };
  }, [cacheError, cacheProgress.percent, isPreparingRoute, narrationPlayback, playerState, route]);

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
    if (narrationPlayback === "idle" && ritualPlayback !== "playing") {
      setNarrationProgress(null);
      setRitualProgress(null);
      return;
    }

    let frameId = 0;
    const update = () => {
      setNarrationProgress(narrationPlayback === "idle" ? null : audioEngine.current?.getNarrationProgress() ?? null);
      setRitualProgress(ritualPlayback === "playing" ? audioEngine.current?.getEffectProgress() ?? null : null);
      frameId = window.requestAnimationFrame(update);
    };

    update();
    return () => window.cancelAnimationFrame(frameId);
  }, [narrationPlayback, ritualPlayback]);

  useEffect(() => {
    setPendingSkipStopId(null);
  }, [activeStopIndex, playerState]);

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
          arrivalFixCount.current += 1;
          if (arrivalFixCount.current < 2) {
            setPlayerState("approaching");
            void audioEngine.current?.startAmbient(ambientUrl);
            audioEngine.current?.setAmbientVolume(0.2 + intensity * 0.22);
            return;
          }

          hasAutoArmedStop.current = true;
          navigator.vibrate?.(80);
          setPlayerState("armed");
          audioEngine.current?.setAmbientVolume(0.44);
        } else if (meters <= currentStop.approachRadiusM) {
          arrivalFixCount.current = 0;
          setPlayerState("approaching");
          void audioEngine.current?.startAmbient(ambientUrl);
          audioEngine.current?.setAmbientVolume(0.2 + intensity * 0.22);
        } else if (playerState === "approaching" && meters > currentStop.approachRadiusM + 75) {
          arrivalFixCount.current = 0;
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
      if (isPreparingRoute) {
        return;
      }

      setCacheError("");
      setIsPreparingRoute(true);
      try {
        await cacheRouteAudio(route, setCacheProgress);
        setIsPreparingRoute(false);
        setPlayerState("ready");
      } catch (error) {
        setIsPreparingRoute(false);
        setCacheError(error instanceof Error ? error.message : "Download failed.");
      }
      return;
    }

    if (playerState === "ready") {
      await audioEngine.current?.unlock();
      setAudioStatus("Unlocked");
      await playRouteIntro();
      return;
    }

    if (playerState === "intro" || playerState === "outro") {
      toggleNarrationPause();
      return;
    }

    if (playerState === "introPlayed") {
      await beginDrive();
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

  function acceptLegalGate() {
    if (!legalCheckboxAccepted) {
      return;
    }

    const acceptance: LegalAcceptance = {
      version: LEGAL_VERSION,
      acceptedAt: new Date().toISOString()
    };
    window.localStorage.setItem(legalAcceptanceStorageKey, JSON.stringify(acceptance));
    playLegalAcceptSting();
    setLegalStatus("accepted");
  }

  function seekNarration(position: number) {
    if (audioEngine.current?.seekNarration(position)) {
      setNarrationProgress(audioEngine.current.getNarrationProgress());
    }
  }

  function resetRitualCue() {
    ritualPlaybackToken.current += 1;
    audioEngine.current?.stopEffects();
    setRitualPlayback("idle");
    setRitualProgress(null);
    setActiveRitualId(null);
  }

  async function beginDrive() {
    if (!currentStop) {
      return;
    }

    playbackToken.current += 1;
    audioEngine.current?.stopNarration();
    resetRitualCue();
    setNarrationPlayback("idle");
    setNarrationProgress(null);

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

    arrivalFixCount.current = 0;
    hasAutoArmedStop.current = false;
    setApproachIntensity(0);
    setPlayerState("traveling");
    void wakeLock.current
      .request()
      .then(() => setWakeStatus(wakeLock.current.supported ? "Active" : "Unsupported"))
      .catch(() => setWakeStatus("Unsupported"));
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
    await audioEngine.current?.playNarration(route.introAudio, ROUTE_NARRATION_VOLUME);
    if (token !== playbackToken.current) {
      return;
    }
    audioEngine.current?.stopAll();
    setNarrationPlayback("idle");
    setNarrationProgress(null);
    setPlayerState("introPlayed");
  }

  function completeOpeningSignal() {
    playbackToken.current += 1;
    audioEngine.current?.stopAll();
    resetRitualCue();
    setNarrationPlayback("idle");
    setNarrationProgress(null);
    setPlayerState("introPlayed");
  }

  function skipRouteIntro() {
    completeOpeningSignal();
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
    await audioEngine.current?.playNarration(route.outroAudio, ROUTE_NARRATION_VOLUME);
    if (token !== playbackToken.current) {
      return;
    }
    setNarrationPlayback("idle");
    setNarrationProgress(null);
    setPlayerState("outroPlayed");
  }

  async function closeRouteAfterOutro() {
    if (selectedLoop) {
      setCompletedLoopIds((ids) => (ids.includes(selectedLoop.id) ? ids : [...ids, selectedLoop.id]));
    }
    playbackToken.current += 1;
    audioEngine.current?.stopAll();
    resetRitualCue();
    await wakeLock.current.release();
    setWakeStatus("Released");
    setNarrationPlayback("idle");
    setNarrationProgress(null);
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
    arrivalFixCount.current = 0;
    hasAutoArmedStop.current = false;
    setPlayerState("traveling");
    if (legAudio) {
      setNarrationPlayback("playing");
      await audioEngine.current?.playNarration(legAudio, ROUTE_NARRATION_VOLUME);
      setNarrationPlayback("idle");
      setNarrationProgress(null);
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
    setNarrationProgress(null);
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

  function openCurrentStopDirections() {
    if (!currentStop) {
      return;
    }

    window.open(mapsUrl(currentStop), "_blank", "noopener,noreferrer");
  }

  function resetStopContext(nextIndex: number) {
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    resetRitualCue();
    setNarrationPlayback("idle");
    setNarrationProgress(null);
    setActiveStopIndex(nextIndex);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    arrivalFixCount.current = 0;
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
      setIsLoopPickerOpen(false);
      return;
    }

    if (loopId === "complete-the-city") {
      const confirmed = window.confirm("This is the full 6 hour marathon across all 39 stops. Start it?");
      if (!confirmed) {
        return;
      }
    }

    if (options.updateUrl !== false) {
      updateLoopUrl(loopId);
    }
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    resetRitualCue();
    window.localStorage.setItem(welcomeSeenStorageKey, "true");
    setHasSeenWelcome(true);
    setSelectedLoopId(loopId);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    arrivalFixCount.current = 0;
    setCurrentPosition(null);
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

  function updateWelcomeFocus() {
    const scroller = welcomeScroller.current;
    if (!scroller) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const centerY = scrollerRect.top + scrollerRect.height / 2;
    const halfHeight = Math.max(scrollerRect.height / 2, 1);
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    welcomeCards.current.forEach((card, index) => {
      if (!card) {
        return;
      }

      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - centerY);
      const normalized = Math.min(distance / halfHeight, 1);
      const eased = normalized * normalized;
      card.style.setProperty("--focus-scale", String(1 - eased * 0.14));
      card.style.setProperty("--focus-opacity", String(1 - eased * 0.72));
      card.style.setProperty("--focus-blur", `${eased * 4}px`);
      card.style.setProperty("--focus-dark", String(Math.min(eased * 1.05, 0.86)));

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== welcomeActiveLoopIndexRef.current) {
      welcomeActiveLoopIndexRef.current = closestIndex;
      navigator.vibrate?.(7);
    }

    setWelcomeActiveLoopIndex(closestIndex);
  }

  function scheduleWelcomeFocusUpdate() {
    if (welcomeAnimationFrame.current !== null) {
      return;
    }

    welcomeAnimationFrame.current = window.requestAnimationFrame(() => {
      welcomeAnimationFrame.current = null;
      updateWelcomeFocus();
    });
  }

  function chooseWelcomeLoop(loop: WelcomeLoop, index: number) {
    if (index !== welcomeActiveLoopIndex) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      welcomeCards.current[index]?.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
      return;
    }

    if (welcomeSelectTimer.current !== null) {
      window.clearTimeout(welcomeSelectTimer.current);
    }

    navigator.vibrate?.([10, 40, 10]);
    setWelcomeFlashLoopName(loop.title);
    welcomeSelectTimer.current = window.setTimeout(() => {
      setWelcomeFlashLoopName("");
      selectLoop(loop.id);
      welcomeSelectTimer.current = null;
    }, 900);
  }

  function switchLoopMidDrive(loopId: string) {
    if (!route || loopId === selectedLoop?.id) {
      return;
    }

    const nextLoop = route.loops?.find((loop) => loop.id === loopId);
    if (!nextLoop) {
      return;
    }

    const confirmed = window.confirm(`Leave ${selectedLoop?.title ?? "this tour"} and start ${nextLoop.title}? Current tour progress will be cleared.`);
    if (!confirmed) {
      return;
    }

    updateLoopUrl(loopId);
    playbackToken.current += 1;
    audioEngine.current?.stopOneShots();
    resetRitualCue();
    setSelectedLoopId(loopId);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    arrivalFixCount.current = 0;
    setCurrentPosition(null);
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
    resetRitualCue();
    updateLoopUrl(nextUnfinishedLoop.id);
    setSelectedLoopId(nextUnfinishedLoop.id);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    arrivalFixCount.current = 0;
    setCurrentPosition(null);
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
    resetRitualCue();
    await wakeLock.current.release();
    setWakeStatus("Released");
    setNarrationPlayback("idle");
    setNarrationProgress(null);
    setSelectedLoopId(null);
    setIsLoopPickerOpen(false);
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setApproachIntensity(0);
    arrivalFixCount.current = 0;
    setCurrentPosition(null);
    setLocationMode("unknown");
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

    if (needsSkipConfirm && pendingSkipStopId !== currentStop.id) {
      setPendingSkipStopId(currentStop.id);
      return;
    }

    setPendingSkipStopId(null);
    if (!completedStopIds.has(currentStop.id)) {
      setSkippedStopIds((ids) => (ids.includes(currentStop.id) ? ids : [...ids, currentStop.id]));
    }
    resetStopContext(activeStopIndex + 1);
  }

  function previousStop() {
    if (!route || activeStopIndex <= 0) {
      return;
    }

    resetStopContext(activeStopIndex - 1);
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
    arrivalFixCount.current = 0;
    setCurrentPosition(null);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setSessionEvents([]);
    setSkippedStopIds([]);
    setCompletedLoopIds([]);
    setResumeState(null);
    setShareStatus("");
    window.localStorage.removeItem(resumeStorageKey);
    setPlayerState("ready");
  }

  function stopRitualCue() {
    audioEngine.current?.stopEffects();
  }

  async function triggerRitual(ritual: NonNullable<Stop["rituals"]>[number]) {
    if (!currentStop) {
      return;
    }

    if (playerState !== "played" || ritualPlayback === "playing") {
      return;
    }

    if (!ritual.cueAudio && sessionEvents.some((event) => event.type === "ritual" && event.ritualId === ritual.id)) {
      return;
    }

    const token = playbackToken.current;
    const ritualToken = ritualPlaybackToken.current + 1;
    ritualPlaybackToken.current = ritualToken;
    setActiveRitualId(ritual.id);
    if (ritual.cueAudio) {
      setRitualPlayback("playing");
      await audioEngine.current?.playCue(ritual.cueAudio);
      if (token !== playbackToken.current || ritualToken !== ritualPlaybackToken.current) {
        return;
      }
      setRitualPlayback("played");
      setRitualProgress(null);
    } else {
      setRitualPlayback("played");
      setRitualProgress(null);
    }
    const payoffFired = Boolean(ritual.payoff && Math.random() <= ritual.payoff.probability);

    if (payoffFired && ritual.payoff) {
      await new Promise((resolve) => window.setTimeout(resolve, ritual.payoff?.delayMs ?? 0));
      if (token !== playbackToken.current || ritualToken !== ritualPlaybackToken.current) {
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
      : "The tour closed without a witness.";
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

          {!hasCheckedLegal || legalStatus === "checking" ? (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">LEGAL CHECK</span>
                <span className="sealed">WAIT</span>
              </div>
              <h2>Checking terms</h2>
              <p>Looking for this device&apos;s legal acknowledgment before loading the route.</p>
            </div>
          ) : legalStatus === "blocked" ? (
            <LegalGate
              accepted={legalCheckboxAccepted}
              onAccept={acceptLegalGate}
              onAcceptedChange={setLegalCheckboxAccepted}
            />
          ) : !route ? (
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
              <div className="welcome-intro compact">
                <span className="stop-count">Choose your night</span>
              <h2>Pick tonight&apos;s tour.</h2>
              </div>
              <div className="closest-loop-row">
                <button
                  className="location-link"
                  data-locating={welcomeLocationStatus === "requesting"}
                  disabled={welcomeLocationStatus === "requesting"}
                  onClick={requestWelcomeLocation}
                  type="button"
                >
                  <LocateFixed className="location-link-icon" aria-hidden="true" />
                  <span>{welcomeLocationStatus === "requesting" ? "Checking your closest tour..." : "Show me the closest tour"}</span>
                </button>
                {welcomeLocationStatus === "enabled" && <span>Approximate distance to each first stop.</span>}
                {welcomeLocationStatus === "denied" && <span>Location skipped. The start areas below still work.</span>}
                {welcomeLocationStatus === "far" && <span>You do not look near Saskatoon. Showing start areas instead.</span>}
              </div>
              <div className="welcome-loop-stage">
                <div className="welcome-loop-scroller" ref={welcomeScroller} onScroll={scheduleWelcomeFocusUpdate}>
                  <div className="welcome-loop-track">
                    {welcomeLoops.map((loop, index) => (
                      <a
                        className="welcome-loop-card"
                        data-active={index === welcomeActiveLoopIndex}
                        data-closest={loop.isClosest}
                        data-marathon={loop.isMarathon}
                        href={loopHref(loop.id)}
                        key={loop.id}
                        ref={(element) => {
                          welcomeCards.current[index] = element;
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          chooseWelcomeLoop(loop, index);
                        }}
                      >
                        <span className="welcome-card-dark" aria-hidden />
                        <div className="welcome-loop-card-head">
                          <span className="welcome-loop-eyebrow">Tour <strong>{String(loop.loopNumber).padStart(2, "0")}</strong></span>
                          <span className="welcome-loop-badges">
                            {loop.isClosest && <span>Closest</span>}
                            {loop.isMarathon && <span>Marathon</span>}
                          </span>
                        </div>
                        <strong className="welcome-loop-name">{loop.title}</strong>
                        <span className="welcome-loop-hook">{loop.subtitle}</span>
                        <span className="welcome-loop-rule" aria-hidden />
                        <span className="welcome-loop-meta">
                          <span>Start</span>
                          <strong>{loop.startText}</strong>
                        </span>
                        <span className="welcome-loop-meta">
                          <span>Area</span>
                          <strong>{loop.area}</strong>
                        </span>
                        <span className="welcome-loop-stats">
                          <strong className={loop.isMarathon ? "is-marathon-duration" : undefined}>{loop.estimatedDuration}</strong>
                          <span><em>Finale</em>{loop.finale}</span>
                        </span>
                        {loop.distanceMeters !== null && welcomeLocationStatus === "enabled" && (
                          <span className="welcome-loop-distance">First stop about {formatApproxDistance(loop.distanceMeters)} away, straight line</span>
                        )}
                        <span className="welcome-loop-footer">
                          <span className="welcome-loop-pick">
                            <ArrowRight aria-hidden="true" />
                            Choose this night
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="welcome-loop-rail" aria-hidden>
                  {welcomeLoops.map((loop, index) => (
                    <span className={index === welcomeActiveLoopIndex ? "on" : ""} key={loop.id} />
                  ))}
                </div>
                <div className="welcome-loop-count">
                  Tour <strong>{String(welcomeActiveLoopIndex + 1).padStart(2, "0")}</strong> / {String(welcomeLoops.length).padStart(2, "0")}
                </div>
                <div className="welcome-loop-flash" data-show={Boolean(welcomeFlashLoopName)} aria-hidden={!welcomeFlashLoopName}>
                  <span>Tour selected</span>
                  <strong>{welcomeFlashLoopName || "Tour"}</strong>
                  <em>Preparing in a moment</em>
                </div>
              </div>
            </div>
          ) : !currentStop ? (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">TOUR</span>
                <span className="sealed">EMPTY</span>
              </div>
              <h2>Tour unavailable</h2>
              <p>Choose a different night from the tour screen.</p>
            </div>
          ) : (
            <>
          {route.loops && route.loops.length > 0 && isLoopLanding && (
            <div className="panel loop-panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">TONIGHT&apos;S TOUR</span>
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
                  {(playerState === "preflight" || playerState === "ready") && (
                    <button className="small-button exit-button" onClick={() => setIsLoopPickerOpen(true)}>Change Tour</button>
                  )}
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
                    {selectedLoopHeldCount} more stop{selectedLoopHeldCount === 1 ? "" : "s"} on this tour, locked until safe parking is confirmed
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

          {isStopPage && (
            <div className="hero">
              <span className="stop-count">
                {selectedLoop?.title ?? "Tour"} / Stop {activeStopIndex + 1} of {activeStops.length}
              </span>
              <h2 className="stop-name">{currentStop.title}</h2>
              <div className="presence" data-state={stopStatus}>
                <span className="presence-dot" aria-hidden />
                <span>{stopStatusLabel(stopStatus)}</span>
              </div>
            </div>
          )}

          <div className="transport-cluster">
            <button
              className={`primary ${primary.className}`}
              data-preparing={isPreparingRoute}
              disabled={primary.disabled}
              onClick={handlePrimary}
              style={{ "--prepare-progress": `${cacheProgress.percent}%` } as CSSProperties}
            >
              <span>{primary.label}</span>
            </button>
            {isLoopLanding && (playerState === "preflight" || playerState === "ready") && (
              <div className="prepare-route-note">
                {playerState === "ready" ? (
                  <>
                    <p>Introduction is ready.</p>
                    <p>Listen while parked, then Begin Drive when you are ready to move.</p>
                  </>
                ) : isPreparingRoute ? (
                  <>
                    <p className="cache-current" aria-live="polite">
                      {cacheProgress.currentUrl ? `Downloading ${cacheFilename(cacheProgress.currentUrl)}` : ""}
                    </p>
                    <p>Audio is being stored on this device for offline playback.</p>
                  </>
                ) : (
                  <>
                    <p>Downloads the audio guide to your phone so the tour works offline, even with no signal.</p>
                    <p>Location is requested on Begin Drive so the app can arm stops while foregrounded. If it is off, every stop still works by hand.</p>
                    {cacheError && <p className="cache-error">{cacheError}</p>}
                  </>
                )}
              </div>
            )}
            {isDriveActive && narrationPlayback !== "idle" && (
              <PlaybackSignal
                label="Narration playback"
                paused={narrationPlayback === "paused"}
                progress={narrationProgress}
                onSeek={seekNarration}
              />
            )}
            {playerState === "intro" && (
              <button className="transport-secondary" onClick={skipRouteIntro}>
                Skip Intro
              </button>
            )}
          </div>

          {isStopPage && (
            <div className="secondary-row">
              <button className="secondary directions-button" onClick={openCurrentStopDirections}>
                <Navigation className="directions-icon" aria-hidden="true" />
                <span>Directions</span>
              </button>
              <button
                aria-label={isPrepared ? "Stop list" : "Stop list locked, prepare first"}
                className="secondary stops-gate"
                data-locked={!isPrepared}
                disabled={!isPrepared}
                onClick={() => {
                  if (isPrepared) {
                    setIsStopsBoardOpen((open) => !open);
                  }
                }}
              >
                Stop List
              </button>
              {activeStopIndex > 0 && playerState !== "outro" && playerState !== "outroPlayed" && (
                <button className="secondary" onClick={previousStop}>
                  Previous File
                </button>
              )}
              {playerState === "played" ? (
                <>
                  <button className="secondary" onClick={() => void advanceAfterPlayed()}>
                    {activeStopIndex === activeStops.length - 1 ? "Close Tour" : "Next File"}
                  </button>
                  {activeStopIndex < activeStops.length - 1 && (
                    <button className="secondary" onClick={skipCurrentStop} disabled={!canSkip}>
                      Skip
                    </button>
                  )}
                </>
              ) : playerState === "outroPlayed" ? (
                <button className="secondary" onClick={() => void closeRouteAfterOutro()}>
                  Close Tour
                </button>
              ) : playerState === "outro" ? null : (
                <>
                  <button className="secondary im-here-button" data-state={imHereState} onClick={() => void armManually()} disabled={!canArmManually}>
                    <Play className="im-here-icon" aria-hidden="true" fill="currentColor" />
                    <span>I&apos;m Here</span>
                  </button>
                  <button className="secondary" onClick={skipCurrentStop} disabled={!canSkip}>
                    {skipLabel}
                  </button>
                </>
              )}
            </div>
          )}

          {isStopPage && isStopsBoardOpen && (
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
                  <summary>Change Tour</summary>
                  <div className="loop-switch-list">
                    {route.loops.filter((loop) => loop.id !== selectedLoop?.id).map((loop) => (
                      <button className="stop-row loop-switch-row" key={loop.id} onClick={() => switchLoopMidDrive(loop.id)}>
                        <span>{completedLoopIdSet.has(loop.id) ? "DONE" : "TOUR"}</span>
                        <strong>{loop.title}</strong>
                        <em>start over</em>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {isStopPage && currentStop.rituals && (playerState === "armed" || playerState === "playing" || playerState === "played") && (
            <div className="ritual-panel" aria-label="Ritual actions">
              <span className="tiny">Ritual</span>
              {currentStop.rituals.map((ritual) => {
                const isAudioRitual = Boolean(ritual.cueAudio);
                const isArmed = playerState === "played";
                const isActive = activeRitualId === ritual.id && ritualPlayback === "playing";
                const hasPlayed = activeRitualId === ritual.id && ritualPlayback === "played";
                const hasAcknowledged = !isAudioRitual && sessionEvents.some((event) => event.type === "ritual" && event.ritualId === ritual.id);
                const ritualLabel = ritual.label.toLowerCase();
                const buttonLabel = !isArmed
                  ? "Ready after the story"
                  : !isAudioRitual
                    ? hasAcknowledged ? "Done" : "We did it"
                    : isActive
                      ? "Stop cue"
                      : `${hasPlayed ? "Replay" : "Play"} ${ritualLabel}`;

                return (
                  <div
                    className="ritual-action"
                    data-armed={isArmed}
                    data-type={isAudioRitual ? "audio" : "action"}
                    data-anticipating={!isArmed && playerState === "playing" && (narrationProgress?.percent ?? 0) >= 85}
                    key={ritual.id}
                  >
                    {!isAudioRitual && <strong className="ritual-directive">{ritual.instructionText}</strong>}
                    <button
                      className="ritual-button"
                      disabled={!isArmed || hasAcknowledged}
                      onClick={() => isActive ? stopRitualCue() : void triggerRitual(ritual)}
                    >
                      {buttonLabel}
                    </button>
                    {isAudioRitual && <p>{ritual.instructionText}</p>}
                    {isAudioRitual && isActive && (
                      <PlaybackSignal label={`${ritual.label} playback`} progress={ritualProgress} variant="ritual" bars={18} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isStopPage && (
            <details className="map-drawer">
              <summary>Route Map</summary>
              <RouteMap stops={activeStops} activeStopIndex={activeStopIndex} currentPosition={currentPosition} />
            </details>
          )}

          {isStopPage && (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">STOP {String(activeStopIndex + 1).padStart(2, "0")}</span>
                <span className="sealed">{playerState === "armed" ? "OPENING" : playerState === "playing" ? "ON AIR" : "OPEN"}</span>
              </div>
              <h2>{stopStatusLabel(stopStatus)}</h2>
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
                <strong>{cacheStatusText}</strong>
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
              <div className="completion-actions">
                <a className="small-button" href={reviewUrl()}>Submit Review</a>
                <button className="small-button" onClick={() => void returnHome()}>Exit</button>
              </div>
              <button className="small-button" onClick={() => void shareRecap()}>Share recap</button>
              {nextUnfinishedLoop && (
                <div className="next-loop-panel">
                  <p>
                    {loopsLeftTonight} tour{loopsLeftTonight === 1 ? "" : "s"} left tonight.
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
          {legalStatus === "accepted" && <LegalDocuments />}
        </section>
      </div>
    </main>
  );
}
