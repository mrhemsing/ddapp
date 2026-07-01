import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const outputDir = path.join(process.cwd(), "public", "audio", "voice-auditions");

const passages = [
  {
    id: "intro",
    script: `Tonight, you will drive through Saskatoon.

The route is ordinary.
Streets you may have driven a hundred times.

But after dark, this city keeps other appointments.

What you are about to hear is drawn from record, from rumor, and from the accounts of people who were there... and who never fully explained what they saw.

Eight stops.
One tour.

When a place is ready for you, the screen will change.

Until then... just drive.`
  },
  {
    id: "stop",
    script: `For decades, this building trained the people who would teach this province's children.

After hours, it appears to have admitted something else.

An instructor arrived one morning and found books outside his door.
No one admitted leaving them there.

Then it happened again.
And again.

One morning, he entered before the others.

Inside his office, a woman's voice was already on the telephone.
Calm.
Familiar.
Making plans in a room that should have been empty.

Then came music.

Old classical music, playing where no radio was on.

If you stop here, keep your voice low.
Let the building answer first.`
  }
];

const candidates = [
  {
    id: "george-case-file",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    voiceName: "George",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.72, similarityBoost: 0.86, style: 0.18, speed: 0.82, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-george-case-file.mp3",
      stop: "/audio/voice-auditions/stop-george-case-file.mp3"
    }
  },
  {
    id: "roger-dry-investigator",
    voiceId: "CwhRBWXzGAHq8TQ4Fs17",
    voiceName: "Roger",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.78, similarityBoost: 0.84, style: 0.14, speed: 0.8, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-roger-dry-investigator.mp3",
      stop: "/audio/voice-auditions/stop-roger-dry-investigator.mp3"
    }
  },
  {
    id: "brian-broadcast-baritone",
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceName: "Brian",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.76, similarityBoost: 0.86, style: 0.12, speed: 0.82, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-brian-broadcast-baritone.mp3",
      stop: "/audio/voice-auditions/stop-brian-broadcast-baritone.mp3"
    }
  },
  {
    id: "adam-grim-detective",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    voiceName: "Adam",
    model: "eleven_multilingual_v2",
    settings: { stability: 0.74, similarityBoost: 0.82, style: 0.16, speed: 0.8, speakerBoost: true },
    samples: {
      intro: "/audio/voice-auditions/intro-adam-grim-detective.mp3",
      stop: "/audio/voice-auditions/stop-adam-grim-detective.mp3"
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
