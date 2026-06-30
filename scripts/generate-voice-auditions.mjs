import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fakeRoute } from "../lib/route-data.ts";
import { saskatoonAll40Stops } from "../lib/saskatoon-all-40-scripts.ts";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const outputDir = path.join(process.cwd(), "public", "audio", "voice-auditions");
const stopPassage = saskatoonAll40Stops.find((stop) => stop.id === "ea-davies-building") ?? saskatoonAll40Stops[0];
const passages = [
  { id: "intro", script: fakeRoute.introScript ?? "" },
  { id: "stop", script: stopPassage.script }
];
const candidates = [
  {
    id: "george-detached-storyteller",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    voiceName: "George",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.34, similarityBoost: 0.78, style: 0.38, speed: 0.9, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-george-detached-storyteller.mp3",
      stop: "/audio/voice-auditions/stop-george-detached-storyteller.mp3"
    }
  },
  {
    id: "brian-close-car",
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceName: "Brian",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.3, similarityBoost: 0.72, style: 0.46, speed: 0.86, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-brian-close-car.mp3",
      stop: "/audio/voice-auditions/stop-brian-close-car.mp3"
    }
  },
  {
    id: "adam-degraded-transmission",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    voiceName: "Adam",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.28, similarityBoost: 0.7, style: 0.52, speed: 0.88, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-adam-degraded-transmission.mp3",
      stop: "/audio/voice-auditions/stop-adam-degraded-transmission.mp3"
    }
  }
];

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY.");
}

await mkdir(outputDir, { recursive: true });

for (const candidate of candidates) {
  for (const passage of passages) {
    const sampleUrl = candidate.samples[passage.id];
    const filename = sampleUrl.split("/").filter(Boolean).at(-1);

    if (!filename) {
      throw new Error(`Missing sample filename for ${candidate.id} ${passage.id}.`);
    }

    console.log(`Generating ${filename} with ${candidate.voiceName}`);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${candidate.voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text: passage.script,
        model_id: candidate.model,
        voice_settings: {
          stability: candidate.settings.stability,
          similarity_boost: candidate.settings.similarityBoost,
          style: candidate.settings.style,
          speed: candidate.settings.speed,
          use_speaker_boost: candidate.settings.speakerBoost
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs failed for ${candidate.id} ${passage.id}: ${response.status} ${errorText}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(outputDir, filename), audio);
    console.log(`Wrote ${filename} (${audio.length} bytes)`);
  }
}
