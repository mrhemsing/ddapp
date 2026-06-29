import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional; deployment/CI can provide env vars directly.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const defaultDarkDrivesVoiceId = "onwK4e9ZLuTAKqWW03F9";
const voiceId = process.env.DARK_DRIVES_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID ?? defaultDarkDrivesVoiceId;
const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const inputPath = path.join(process.cwd(), "private", "dark-drives-drive-legs.json");
const outputDir = path.join(process.cwd(), "public", "audio", "drive-legs");

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY.");
}

const source = JSON.parse(await readFile(inputPath, "utf8"));
const loops = source.loops ?? [];
const legs = loops.flatMap((loop) =>
  (loop.legs ?? []).map((leg) => ({
    loopId: loop.id,
    ...leg
  }))
);

await mkdir(outputDir, { recursive: true });
console.log(`Using ElevenLabs voice ${voiceId}`);
console.log(`Generating ${legs.length} drive legs`);

for (const leg of legs) {
  const filename = path.basename(leg.audioFile);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: leg.script,
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
    throw new Error(`ElevenLabs failed for ${leg.loopId} ${leg.fromStopId}->${leg.toStopId}: ${response.status} ${errorText}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(outputDir, filename), audio);
  console.log(`Generated ${filename} (${audio.length} bytes)`);
}
