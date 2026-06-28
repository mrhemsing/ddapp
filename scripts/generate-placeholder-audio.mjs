import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDir = join(root, "public", "audio");
mkdirSync(audioDir, { recursive: true });

const files = [
  ["intro.wav", 220, 5],
  ["outro.wav", 175, 5],
  ["ambient-low.wav", 82, 12],
  ["woodlawn-story.wav", 294, 7],
  ["bridge-story.wav", 247, 7],
  ["park-story.wav", 196, 7],
  ["leg-woodlawn-to-bridge.wav", 147, 5],
  ["leg-bridge-to-park.wav", 165, 5]
];

for (const [name, frequency, seconds] of files) {
  writeFileSync(join(audioDir, name), createWave(frequency, seconds));
}

function createWave(frequency, seconds) {
  const sampleRate = 44100;
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 4410, (samples - i) / 4410);
    const wobble = Math.sin((i / sampleRate) * Math.PI * 2 * 0.8) * 0.22;
    const value = Math.sin((i / sampleRate) * Math.PI * 2 * (frequency + wobble)) * envelope * 0.28;
    buffer.writeInt16LE(Math.max(-1, Math.min(1, value)) * 32767, 44 + i * 2);
  }

  return buffer;
}
