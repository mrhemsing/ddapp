import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fakeRoute } from "../lib/route-data.ts";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional; deployment/CI can provide env vars directly.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const defaultDarkDrivesVoiceId = "onwK4e9ZLuTAKqWW03F9";
const voiceId = process.env.DARK_DRIVES_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? defaultDarkDrivesVoiceId;
const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const outputDir = path.join(process.cwd(), "public", "audio", "elevenlabs-review");

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY.");
}

const items = [
  {
    id: "intro",
    title: "Route intro",
    script: fakeRoute.introScript
  },
  ...fakeRoute.stops.flatMap((stop, index) => {
    const items = [
      {
        id: `${String(index + 1).padStart(2, "0")}-${stop.id}`,
        title: stop.title,
        script: stop.audio.reviewScript ?? stop.story.body
      }
    ];

    if (stop.driveToNextScript) {
      items.push({
        id: `leg-${stop.id}-to-${fakeRoute.stops[index + 1]?.id ?? "end"}`,
        title: `${stop.title} drive leg`,
        script: stop.driveToNextScript
      });
    }

    return items;
  }),
  {
    id: "outro",
    title: "Route outro",
    script: fakeRoute.outroScript
  }
].filter((item) => item.script?.trim());

await mkdir(outputDir, { recursive: true });
console.log(`Using ElevenLabs voice ${voiceId}`);

for (const item of items) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: item.script,
      model_id: modelId,
      voice_settings: {
        stability: 0.44,
        similarity_boost: 0.82,
        style: 0.24,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs failed for ${item.title}: ${response.status} ${errorText}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  const filename = `${item.id}.mp3`;
  await writeFile(path.join(outputDir, filename), audio);
  console.log(`Generated ${filename} (${audio.length} bytes)`);
}
