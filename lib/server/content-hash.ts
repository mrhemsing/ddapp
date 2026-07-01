import { sha256 } from "@/lib/server/crypto";

export type VoiceHashInput = {
  voiceId: string;
  modelId: string;
  settings: unknown;
};

export function normalizeScriptForHash(script: string) {
  return script
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function scriptHash(script: string) {
  return sha256(normalizeScriptForHash(script));
}

export function contentHash(script: string, voice: VoiceHashInput) {
  return sha256([
    normalizeScriptForHash(script),
    voice.voiceId,
    voice.modelId,
    canonicalJson(voice.settings)
  ].join("\x00"));
}

export function hash12(hash: string) {
  return hash.slice(0, 12);
}
