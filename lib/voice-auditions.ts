import { fakeRoute } from "@/lib/route-data";
import { saskatoonAll40AudioPath, saskatoonAll40Stops } from "@/lib/saskatoon-all-40-scripts";

export type VoiceAuditionPassageId = "intro" | "stop";

export type VoiceAuditionSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  speakerBoost: boolean;
};

export type VoiceAuditionCandidate = {
  id: string;
  label: string;
  direction: string;
  provider: "ElevenLabs";
  voiceId: string;
  voiceName: string;
  model: string;
  settings: VoiceAuditionSettings;
  postProcessing: string;
  samples: Record<VoiceAuditionPassageId, string>;
  isControl?: boolean;
};

export const voiceAuditionStorageKey = "dark-drives:voice-auditions:v1";

const stopPassage = saskatoonAll40Stops.find((stop) => stop.id === "ea-davies-building") ?? saskatoonAll40Stops[0];
const graveDocumentaryIntroScript = `Tonight, you will drive through Saskatoon.

The route is ordinary.
Streets you may have driven a hundred times.

But after dark, this city keeps other appointments.

What you are about to hear is drawn from record, from rumor, and from the accounts of people who were there... and who never fully explained what they saw.

Eight stops.
One loop.

When a place is ready for you, the screen will change.

Until then... just drive.`;

const graveDocumentaryStopScript = `For decades, this building trained the people who would teach this province's children.

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
Let the building answer first.`;

export const voiceAuditionTargetReference = {
  label: "Target register",
  title: "Grave documentary authority",
  description:
    "Older, weathered male baritone. Dry and deliberate. A case-file narrator reporting unsettling facts without theatricality. Clean host voice, no ghost whisper, no lo-fi host processing, and no real-person clone."
};

export const voiceAuditionPassages: Array<{
  id: VoiceAuditionPassageId;
  label: string;
  description: string;
  script: string;
}> = [
  {
    id: "intro",
    label: "Opening Signal",
    description: "Cadence rewrite for a grave documentary host.",
    script: graveDocumentaryIntroScript
  },
  {
    id: "stop",
    label: stopPassage.title,
    description: "Cadence rewrite for range and case-file gravity.",
    script: graveDocumentaryStopScript
  }
];

export const voiceAuditionCandidates: VoiceAuditionCandidate[] = [
  {
    id: "control-daniel",
    label: "Control: current production",
    direction: "Incumbent route voice.",
    provider: "ElevenLabs",
    voiceId: "onwK4e9ZLuTAKqWW03F9",
    voiceName: "Daniel",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.44,
      similarityBoost: 0.82,
      style: 0.24,
      speed: 1,
      speakerBoost: true
    },
    postProcessing: "None in audition. Production app applies foreground gain at playback.",
    samples: {
      intro: fakeRoute.introAudio,
      stop: saskatoonAll40AudioPath(stopPassage)
    },
    isControl: true
  },
  {
    id: "george-case-file",
    label: "Case-file narrator",
    direction: "Mature documentary read with measured pauses and restrained gravity.",
    provider: "ElevenLabs",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    voiceName: "George",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.72,
      similarityBoost: 0.86,
      style: 0.18,
      speed: 0.82,
      speakerBoost: true
    },
    postProcessing: "Clean host. No lo-fi treatment.",
    samples: {
      intro: "/audio/voice-auditions/intro-george-case-file.mp3",
      stop: "/audio/voice-auditions/stop-george-case-file.mp3"
    }
  },
  {
    id: "roger-dry-investigator",
    label: "Dry investigator",
    direction: "Resonant, unsentimental, and matter-of-fact.",
    provider: "ElevenLabs",
    voiceId: "CwhRBWXzGAHq8TQ4Fs17",
    voiceName: "Roger",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.78,
      similarityBoost: 0.84,
      style: 0.14,
      speed: 0.8,
      speakerBoost: true
    },
    postProcessing: "Clean host. Optional light room weight later only if needed.",
    samples: {
      intro: "/audio/voice-auditions/intro-roger-dry-investigator.mp3",
      stop: "/audio/voice-auditions/stop-roger-dry-investigator.mp3"
    }
  },
  {
    id: "brian-broadcast-baritone",
    label: "Broadcast baritone",
    direction: "Deep, controlled, and classic narration without whisper delivery.",
    provider: "ElevenLabs",
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceName: "Brian",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.76,
      similarityBoost: 0.86,
      style: 0.12,
      speed: 0.82,
      speakerBoost: true
    },
    postProcessing: "Clean host. No breathy or close-whisper treatment.",
    samples: {
      intro: "/audio/voice-auditions/intro-brian-broadcast-baritone.mp3",
      stop: "/audio/voice-auditions/stop-brian-broadcast-baritone.mp3"
    }
  },
  {
    id: "adam-grim-detective",
    label: "Grim detective",
    direction: "Firm, lower, and severe, but kept clean and restrained.",
    provider: "ElevenLabs",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    voiceName: "Adam",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.74,
      similarityBoost: 0.82,
      style: 0.16,
      speed: 0.8,
      speakerBoost: true
    },
    postProcessing: "Clean host. Transmission effects reserved for in-world voices.",
    samples: {
      intro: "/audio/voice-auditions/intro-adam-grim-detective.mp3",
      stop: "/audio/voice-auditions/stop-adam-grim-detective.mp3"
    }
  }
];
