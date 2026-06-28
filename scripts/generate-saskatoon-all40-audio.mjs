import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { saskatoonAll40AudioPath, saskatoonAll40Stops } from "../lib/saskatoon-all-40-scripts.ts";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional; deployment/CI can provide env vars directly.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const defaultDarkDrivesVoiceId = "onwK4e9ZLuTAKqWW03F9";
const voiceId = process.env.DARK_DRIVES_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? defaultDarkDrivesVoiceId;
const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const outputDir = path.join(process.cwd(), "public", "audio", "saskatoon-all-40");

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY.");
}

await mkdir(outputDir, { recursive: true });
console.log(`Using ElevenLabs voice ${voiceId}`);

for (const stop of saskatoonAll40Stops) {
  const filename = path.basename(saskatoonAll40AudioPath(stop));
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: stop.script,
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
    throw new Error(`ElevenLabs failed for stop ${stop.index} ${stop.title}: ${response.status} ${errorText}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(outputDir, filename), audio);
  console.log(`Generated ${filename} (${audio.length} bytes)`);
}
