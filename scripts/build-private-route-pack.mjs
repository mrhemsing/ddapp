import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fakeRoute } from "../lib/route-data.ts";
import { saskatoonAll40AudioPath, saskatoonAll40Stops } from "../lib/saskatoon-all-40-scripts.ts";
import { ritualAssetsForStop } from "../lib/saskatoon-ritual-assets.ts";

const defaultConfigPath = path.join(process.cwd(), "private", "dark-drives-stop-config.json");
const configPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultConfigPath;
const outputDir = path.join(process.cwd(), "private");
const packPath = path.join(outputDir, "dark-drives-route-pack.json");
const b64Path = path.join(outputDir, "dark-drives-route-pack.b64");
const manifestPath = path.join(outputDir, "dark-drives-route-pack-assets.json");
const ambientFile = "/audio/ambient-low.wav";
const configIdAliases = new Map([
  ["woodlawn", "woodlawn-cemetery"]
]);

function asStopsConfig(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.stops)) return raw.stops;
  throw new Error("Stop config must be an array or an object with a stops array.");
}

function requireNumber(value, name, stopId) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${stopId} is missing numeric ${name}.`);
  }

  return value;
}

function parkPointFor(config, stopId) {
  if (!config.parkPoint) return undefined;

  return {
    lat: requireNumber(config.parkPoint.lat, "parkPoint.lat", stopId),
    lng: requireNumber(config.parkPoint.lng, "parkPoint.lng", stopId),
    label: config.parkPoint.label ?? "Verified legal public vantage point"
  };
}

function teaserFrom(script) {
  return script.split(/\n\s*\n/)[0] ?? script.slice(0, 160);
}

function ritualsFor(stop) {
  const assets = ritualAssetsForStop(stop.index);

  if (assets.length === 0 && stop.ritualCue) {
    return [
      {
        id: `${stop.id}-ritual`,
        label: "Run ritual",
        type: "instruction",
        instructionText: stop.ritualCue,
        visualOnly: true
      }
    ];
  }

  const payoffs = assets.filter((asset) => asset.kind === "payoff");
  const rituals = [];

  for (const asset of assets) {
    if (asset.kind === "payoff") continue;

    const payoff = payoffs.shift();
    const hasCue = asset.kind === "cue" && Boolean(asset.audioFile);

    rituals.push({
      id: asset.id,
      label: asset.label,
      type: hasCue ? "audioCue" : "instruction",
      ...(hasCue ? { cueAudio: asset.audioFile } : {}),
      instructionText: stop.ritualCue ?? asset.note,
      ...(asset.kind === "visual" || asset.kind === "physical" || asset.kind === "timer" ? { visualOnly: true } : {}),
      ...(payoff?.audioFile
        ? {
            payoff: {
              audioFile: payoff.audioFile,
              delayMs: payoff.delayMs ?? 2500,
              probability: payoff.probability ?? 0.5
            }
          }
        : {})
    });
  }

  for (const payoff of payoffs) {
    if (!payoff.audioFile) continue;
    rituals.push({
      id: payoff.id,
      label: payoff.label,
      type: "instruction",
      instructionText: stop.ritualCue ?? payoff.note,
      payoff: {
        audioFile: payoff.audioFile,
        delayMs: payoff.delayMs ?? 2500,
        probability: payoff.probability ?? 0.5
      }
    });
  }

  return rituals.length > 0 ? rituals : undefined;
}

function assetManifest(route) {
  const urls = new Set([route.introAudio, route.outroAudio]);

  for (const stop of route.stops) {
    urls.add(stop.audio.narrationFile);
    if (stop.audio.ambientFile) urls.add(stop.audio.ambientFile);
    if (stop.driveToNextAudio) urls.add(stop.driveToNextAudio);
    for (const ritual of stop.rituals ?? []) {
      if (ritual.cueAudio) urls.add(ritual.cueAudio);
      if (ritual.payoff?.audioFile) urls.add(ritual.payoff.audioFile);
    }
  }

  return [...urls].sort();
}

function configForScriptId(scriptId) {
  return configById.get(scriptId) ?? configById.get(configIdAliases.get(scriptId));
}

let configRaw;

try {
  configRaw = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  if (error?.code === "ENOENT") {
    throw new Error(`Missing stop config JSON at ${configPath}. Pass a path or place dark-drives-stop-config.json in private/.`);
  }

  throw error;
}

const configs = asStopsConfig(configRaw);
const configById = new Map(configs.map((config) => [config.id, config]));
const stops = [];
const sealedStops = [];

for (const scriptStop of saskatoonAll40Stops) {
  const config = configForScriptId(scriptStop.id);
  if (!config) {
    throw new Error(`Missing config entry for ${scriptStop.index} ${scriptStop.id}.`);
  }

  const parkPoint = parkPointFor(config, scriptStop.id);
  const isHeldForParkPoint = Boolean(config.needsParkPoint && !parkPoint);
  const isSealed = Boolean(config.sealed || isHeldForParkPoint);
  const story = {
    teaser: teaserFrom(scriptStop.script),
    body: scriptStop.script
  };

  if (isSealed) {
    sealedStops.push({
      id: scriptStop.id,
      title: scriptStop.title,
      order: config.order ?? scriptStop.index,
      reason: isHeldForParkPoint
        ? "Held from the live drive until a verified legal parkPoint is set."
        : "Sealed informational entry with no driveable coordinates.",
      story,
      safetyNote: scriptStop.safetyNote
    });
    continue;
  }

  stops.push({
    id: scriptStop.id,
    title: scriptStop.title,
    lat: requireNumber(config.lat, "lat", scriptStop.id),
    lng: requireNumber(config.lng, "lng", scriptStop.id),
    ...(parkPoint ? { parkPoint } : {}),
    approachRadiusM: requireNumber(config.approachRadiusM, "approachRadiusM", scriptStop.id),
    arriveRadiusM: requireNumber(config.arriveRadiusM, "arriveRadiusM", scriptStop.id),
    story,
    audio: {
      narrationFile: saskatoonAll40AudioPath(scriptStop),
      ambientFile,
      durationSec: 0,
      reviewScript: scriptStop.script
    },
    safetyNote: scriptStop.safetyNote,
    rituals: ritualsFor(scriptStop)
  });
}

stops.sort((a, b) => {
  const aOrder = configForScriptId(a.id)?.order ?? 0;
  const bOrder = configForScriptId(b.id)?.order ?? 0;
  return aOrder - bOrder;
});
sealedStops.sort((a, b) => a.order - b.order);

const routePack = {
  id: "saskatoon-production",
  title: "The Dark Side of Saskatoon",
  blurb: "Forty real places known to have paranormal activity.",
  introAudio: fakeRoute.introAudio,
  introScript: fakeRoute.introScript,
  outroAudio: fakeRoute.outroAudio,
  outroScript: fakeRoute.outroScript,
  stops,
  sealedStops
};

const json = JSON.stringify(routePack, null, 2);
await mkdir(outputDir, { recursive: true });
await writeFile(packPath, `${json}\n`);
await writeFile(b64Path, Buffer.from(json, "utf8").toString("base64"));
await writeFile(manifestPath, `${JSON.stringify(assetManifest(routePack), null, 2)}\n`);

console.log(`Wrote ${packPath}`);
console.log(`Wrote ${b64Path}`);
console.log(`Wrote ${manifestPath}`);
console.log(`Drivable stops: ${stops.length}`);
console.log(`Sealed/held entries: ${sealedStops.length}`);
