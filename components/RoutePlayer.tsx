"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { cacheRouteAudio, isRouteCached, type CacheProgress } from "@/lib/audio-cache";
import { DarkDrivesAudioEngine } from "@/lib/audio-engine";
import type { RoutePack, Stop } from "@/lib/route-data";
import { createWakeLockHandle } from "@/lib/wake-lock";

type PlayerState = "preflight" | "ready" | "traveling" | "approaching" | "armed" | "playing" | "played" | "ended";
type LocationMode = "unknown" | "watching" | "manual" | "denied";
const activeDriveStates: PlayerState[] = ["traveling", "approaching", "armed", "playing", "played"];

type SessionEvent =
  | { type: "stopCompleted"; stopId: string; stopTitle: string; timestamp: string }
  | { type: "ritual"; stopId: string; stopTitle: string; ritualId: string; ritualLabel: string; payoffFired: boolean; timestamp: string };

type PositionFix = {
  lat: number;
  lng: number;
  speedMps: number | null;
  timestamp: number;
};

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
  if (playerState === "traveling") return "The road is quiet";
  if (playerState === "approaching") return "Something is close";
  if (playerState === "armed") return "It's here";
  if (playerState === "playing") return "Listen";
  if (playerState === "played") return "File open";
  return "Route closed";
}

function presenceCopy(playerState: PlayerState, distanceMeters: number | null) {
  if (playerState === "approaching" && distanceMeters !== null) return `${distanceMeters.toLocaleString()}m`;
  if (playerState === "armed") return "It found the car";
  if (playerState === "playing") return "Signal active";
  if (playerState === "played") return "The file is open";
  if (playerState === "traveling") return "Nothing on the glass";
  return "Waiting";
}

function localTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function recapStats(events: SessionEvent[]) {
  const completedStops = events.filter((event) => event.type === "stopCompleted");
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
  route,
  activeStopIndex,
  currentPosition
}: {
  route: RoutePack;
  activeStopIndex: number;
  currentPosition: PositionFix | null;
}) {
  const points = route.stops.map((stop) => stop.parkPoint ?? stop);
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
          <g key={route.stops[index].id} className={index === activeStopIndex ? "active-node" : ""}>
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
  const [isNarrating, setIsNarrating] = useState(false);
  const [isForeground, setIsForeground] = useState(true);
  const [ritualMessage, setRitualMessage] = useState("");
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [shareStatus, setShareStatus] = useState("");
  const audioEngine = useRef<DarkDrivesAudioEngine | null>(null);
  const wakeLock = useRef(createWakeLockHandle());
  const lastLocationUpdate = useRef(0);
  const lastPositionFix = useRef<PositionFix | null>(null);
  const hasAutoArmedStop = useRef(false);
  const currentStop = route?.stops[activeStopIndex] ?? null;
  const ambientUrl = currentStop?.audio.ambientFile ?? "/audio/ambient-low.wav";
  const isDriveActive = activeDriveStates.includes(playerState);
  const heartbeatMs = Math.round(2200 - approachIntensity * 1500);
  const screenStyle = {
    "--approach-intensity": approachIntensity.toFixed(3),
    "--heartbeat-ms": `${heartbeatMs}ms`
  } as CSSProperties;
  const stats = recapStats(sessionEvents);

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
    if (playerState === "traveling") return { label: "Keep Driving", disabled: true, className: "" };
    if (playerState === "approaching") return { label: "Something Is Close", disabled: true, className: "approaching" };
    if (playerState === "armed") return { label: "Wake It", disabled: false, className: "ready" };
    if (playerState === "playing") return { label: "Listen", disabled: true, className: "playing" };
    if (playerState === "played") return { label: activeStopIndex === route.stops.length - 1 ? "Close Route" : "Next File", disabled: false, className: "" };
    return { label: "Route Closed", disabled: true, className: "" };
  }, [activeStopIndex, playerState, route]);

  useEffect(() => {
    if (!route) {
      return;
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
    if (playerState !== "traveling" && playerState !== "approaching" && playerState !== "armed" && playerState !== "playing" && playerState !== "played") {
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
      await audioEngine.current?.startAmbient(ambientUrl);
      audioEngine.current?.setAmbientVolume(0.2);
      setIsNarrating(true);
      await audioEngine.current?.playNarration(route.introAudio);
      setIsNarrating(false);
      setPlayerState("traveling");
      return;
    }

    if (playerState === "armed") {
      setPlayerState("playing");
      await audioEngine.current?.startAmbient(ambientUrl);
        setIsNarrating(true);
        await audioEngine.current?.playNarration(currentStop.audio.narrationFile);
        setIsNarrating(false);
        setSessionEvents((events) => [
          ...events,
          {
            type: "stopCompleted",
            stopId: currentStop.id,
            stopTitle: currentStop.title,
            timestamp: new Date().toISOString()
          }
        ]);
        setPlayerState("played");
        return;
    }

    if (playerState === "played") {
      if (activeStopIndex === route.stops.length - 1) {
        setPlayerState("playing");
        setIsNarrating(true);
        await audioEngine.current?.playNarration(route.outroAudio);
        setIsNarrating(false);
        audioEngine.current?.stopAll();
        await wakeLock.current.release();
        setWakeStatus("Released");
        setPlayerState("ended");
      } else {
        const legAudio = currentStop.driveToNextAudio;
        setActiveStopIndex((index) => index + 1);
        setDistanceMeters(null);
        setEffectiveArriveRadius(null);
        setApproachIntensity(0);
        setRitualMessage("");
        hasAutoArmedStop.current = false;
        setPlayerState("traveling");
        if (legAudio) {
          setIsNarrating(true);
          await audioEngine.current?.playNarration(legAudio);
          setIsNarrating(false);
        }
      }
    }
  }

  function armManually() {
    if (!currentStop) {
      return;
    }

    void audioEngine.current?.startAmbient(ambientUrl);
    audioEngine.current?.setAmbientVolume(0.44);
    setApproachIntensity(1);
    hasAutoArmedStop.current = true;
    setPlayerState("armed");
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
    setShareStatus("");
    setPlayerState("ready");
  }

  async function triggerRitual(ritual: NonNullable<Stop["rituals"]>[number]) {
    if (!currentStop) {
      return;
    }

    setRitualMessage(ritual.instructionText);
    if (ritual.cueAudio) {
      setIsNarrating(true);
      await audioEngine.current?.playNarration(ritual.cueAudio);
      setIsNarrating(false);
    }
    const payoffFired = Boolean(ritual.payoff && Math.random() <= ritual.payoff.probability);

    if (payoffFired && ritual.payoff) {
      await new Promise((resolve) => window.setTimeout(resolve, ritual.payoff?.delayMs ?? 0));
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
        <section className={`screen ${isDriveActive ? "drive-active" : ""}`} style={screenStyle} aria-label="Dark Drives route player">
          <header className="topbar">
            <div className="brand">
              <span className="kicker">Dark Drives</span>
              <div className="wordmark" aria-label="Dark Drives">
                Dark Drives<sup>TM</sup>
              </div>
              <h1 className="title">{route?.title ?? "Loading route"}</h1>
            </div>
            <span className="status-pill">{stateCopy(playerState)}</span>
          </header>

          {!route || !currentStop ? (
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
          ) : (
            <>

          <div className="hero">
            <span className="stop-count">
              Stop {activeStopIndex + 1} of {route.stops.length}
            </span>
            <h2 className="stop-name">{currentStop.title}</h2>
            <div className="presence" data-state={playerState}>
              <span className="presence-dot" aria-hidden />
              <span>{presenceCopy(playerState, distanceMeters)}</span>
            </div>
          </div>

          <button className={`primary ${primary.className}`} disabled={primary.disabled} onClick={handlePrimary}>
            {primary.label}
          </button>

          <div className="secondary-row">
            <button className="secondary" onClick={() => window.open(mapsUrl(currentStop), "_blank", "noopener,noreferrer")}>
              Drive There
            </button>
            <button className="secondary" onClick={armManually} disabled={playerState === "preflight" || playerState === "ready" || playerState === "playing" || playerState === "ended"}>
              I&apos;m Here
            </button>
          </div>

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

          {isDriveActive && isNarrating && (
            <div className="signal-meter drive-signal" aria-label="Narration signal">
              {Array.from({ length: 24 }, (_, index) => (
                <span key={index} style={{ height: `${22 + ((index * 19) % 74)}%` }} />
              ))}
            </div>
          )}

          {playerState !== "preflight" && (
            <details className="map-drawer">
              <summary>Route signal</summary>
              <RouteMap route={route} activeStopIndex={activeStopIndex} currentPosition={currentPosition} />
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
              <p>Location is requested on Begin Drive so the app can arm stops while foregrounded. If it is off, every stop still works by hand.</p>
              {cacheError && <p>{cacheError}</p>}
            </div>
          )}

          {playerState !== "preflight" && (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">STOP {String(activeStopIndex + 1).padStart(2, "0")}</span>
                <span className="sealed">{playerState === "armed" ? "OPENING" : playerState === "playing" ? "ON AIR" : "OPEN"}</span>
              </div>
              <h2>{stateCopy(playerState)}</h2>
              {locationMode === "denied" && <p>Location is off. You will arm each stop yourself.</p>}
              <p className="safety-line">{currentStop.safetyNote}</p>
              <details className="read-disclosure">
                <summary>Read it</summary>
                <p>{currentStop.story.body}</p>
              </details>
            </div>
          )}

          {!isDriveActive && <div className="feed">
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
              <strong>{route.sealedStops?.length ?? 0}</strong>
            </div>
            {playerState === "ended" && <button className="small-button" onClick={resetDemo}>Reset demo</button>}
          </div>}
          {route.sealedStops && route.sealedStops.length > 0 && (
            <div className="panel">
              <span className="corner-a" aria-hidden />
              <span className="corner-b" aria-hidden />
              <div className="file-row">
                <span className="file-tab">SEALED FILES</span>
                <span className="sealed">{route.sealedStops.length} HELD</span>
              </div>
              {route.sealedStops.map((sealedStop) => (
                <div className="sealed-entry" key={sealedStop.id}>
                  <h2>{String(sealedStop.order).padStart(2, "0")} {sealedStop.title}</h2>
                  <p>{sealedStop.reason}</p>
                  {sealedStop.safetyNote && <p>{sealedStop.safetyNote}</p>}
                </div>
              ))}
            </div>
          )}
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
