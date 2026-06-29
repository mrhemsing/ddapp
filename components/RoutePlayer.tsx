"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cacheRouteAudio, isRouteCached, type CacheProgress } from "@/lib/audio-cache";
import { DarkDrivesAudioEngine } from "@/lib/audio-engine";
import type { RoutePack, Stop } from "@/lib/route-data";
import { createWakeLockHandle } from "@/lib/wake-lock";

type PlayerState = "preflight" | "ready" | "traveling" | "approaching" | "armed" | "playing" | "played" | "ended";
type LocationMode = "unknown" | "watching" | "manual" | "denied";
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
  const [currentPosition, setCurrentPosition] = useState<PositionFix | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>("unknown");
  const [audioStatus, setAudioStatus] = useState("Locked");
  const [wakeStatus, setWakeStatus] = useState("Not requested");
  const [isNarrating, setIsNarrating] = useState(false);
  const [isForeground, setIsForeground] = useState(true);
  const [ritualMessage, setRitualMessage] = useState("");
  const audioEngine = useRef<DarkDrivesAudioEngine | null>(null);
  const wakeLock = useRef(createWakeLockHandle());
  const lastLocationUpdate = useRef(0);
  const lastPositionFix = useRef<PositionFix | null>(null);
  const hasAutoArmedStop = useRef(false);
  const currentStop = route?.stops[activeStopIndex] ?? null;
  const ambientUrl = currentStop?.audio.ambientFile ?? "/audio/ambient-low.wav";

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
    if (playerState === "traveling") return { label: "Traveling", disabled: true, className: "" };
    if (playerState === "approaching") return { label: distanceMeters === null ? "Approaching" : `Approaching ${distanceMeters}m`, disabled: true, className: "approaching" };
    if (playerState === "armed") return { label: "Wake It", disabled: false, className: "ready" };
    if (playerState === "playing") return { label: "Playing", disabled: true, className: "playing" };
    if (playerState === "played") return { label: activeStopIndex === route.stops.length - 1 ? "End Route" : "Next Stop", disabled: false, className: "" };
    return { label: "Route Complete", disabled: true, className: "" };
  }, [activeStopIndex, distanceMeters, playerState, route]);

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
        setDistanceMeters(meters);
        setEffectiveArriveRadius(armRadius);
        setLocationMode("watching");

        if (playerState === "armed" || hasAutoArmedStop.current) {
          return;
        }

        if (meters <= armRadius) {
          hasAutoArmedStop.current = true;
          navigator.vibrate?.(80);
          setPlayerState("armed");
          audioEngine.current?.setAmbientVolume(0.36);
        } else if (meters <= currentStop.approachRadiusM) {
          setPlayerState("approaching");
          void audioEngine.current?.startAmbient(ambientUrl);
          audioEngine.current?.setAmbientVolume(0.34);
        } else if (playerState === "approaching" && meters > currentStop.approachRadiusM + 75) {
          setPlayerState("traveling");
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
    audioEngine.current?.setAmbientVolume(0.36);
    hasAutoArmedStop.current = true;
    setPlayerState("armed");
  }

  function resetDemo() {
    setActiveStopIndex(0);
    setDistanceMeters(null);
    setEffectiveArriveRadius(null);
    setCurrentPosition(null);
    lastPositionFix.current = null;
    hasAutoArmedStop.current = false;
    setRitualMessage("");
    setPlayerState("ready");
  }

  async function triggerRitual(ritual: NonNullable<Stop["rituals"]>[number]) {
    setRitualMessage(ritual.instructionText);
    if (ritual.cueAudio) {
      setIsNarrating(true);
      await audioEngine.current?.playNarration(ritual.cueAudio);
      setIsNarrating(false);
    }
    if (ritual.payoff && Math.random() <= ritual.payoff.probability) {
      await new Promise((resolve) => window.setTimeout(resolve, ritual.payoff?.delayMs ?? 0));
      await audioEngine.current?.playEffect(ritual.payoff.audioFile, 0.34);
    }
  }

  return (
    <main className="shell">
      <div className="phone">
        <section className="screen" aria-label="Dark Drives route player">
          <header className="topbar">
            <div className="brand">
              <span className="kicker">Dark Drives</span>
              <div className="wordmark" aria-label="Dark Drives">
                Dark Drives<sup>TM</sup>
              </div>
              <h1 className="title">{route?.title ?? "Loading route"}</h1>
            </div>
            <span className="status-pill">{playerState}</span>
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
            <div className="distance">
              {distanceMeters === null ? currentStop.story.teaser : `${distanceMeters.toLocaleString()}m away`}
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

          {playerState !== "preflight" && (
            <RouteMap route={route} activeStopIndex={activeStopIndex} currentPosition={currentPosition} />
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
                <span className="sealed">{playerState === "armed" ? "ARMED" : playerState === "playing" ? "LIVE" : "OPEN"}</span>
              </div>
              <h2>{currentStop.safetyNote}</h2>
              {locationMode === "denied" && <p>Location is off. You will arm each stop yourself.</p>}
              <p>{currentStop.story.body}</p>
              {isNarrating && (
                <div className="signal-meter" aria-label="Narration signal">
                  {Array.from({ length: 24 }, (_, index) => (
                    <span key={index} style={{ height: `${22 + ((index * 19) % 74)}%` }} />
                  ))}
                </div>
              )}
            </div>
          )}

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
              <strong>{route.sealedStops?.length ?? 0}</strong>
            </div>
            {playerState === "ended" && <button className="small-button" onClick={resetDemo}>Reset demo</button>}
          </div>
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
