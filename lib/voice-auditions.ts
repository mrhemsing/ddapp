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

export const voiceAuditionPassages: Array<{
  id: VoiceAuditionPassageId;
  label: string;
  description: string;
  script: string;
}> = [
  {
    id: "intro",
    label: "Opening Signal",
    description: "The actual intro script used before the drive starts.",
    script: fakeRoute.introScript ?? ""
  },
  {
    id: "stop",
    label: stopPassage.title,
    description: "A creepier stop passage to test range and close-mic tension.",
    script: stopPassage.script
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
    id: "george-detached-storyteller",
    label: "Detached storyteller",
    direction: "Older, calm, and unnervingly composed.",
    provider: "ElevenLabs",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    voiceName: "George",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.34,
      similarityBoost: 0.78,
      style: 0.38,
      speed: 0.9,
      speakerBoost: true
    },
    postProcessing: "None. Evaluate raw voice first.",
    samples: {
      intro: "/audio/voice-auditions/intro-george-detached-storyteller.mp3",
      stop: "/audio/voice-auditions/stop-george-detached-storyteller.mp3"
    }
  },
  {
    id: "brian-close-car",
    label: "Close car whisper",
    direction: "Deep, close, low, and intimate.",
    provider: "ElevenLabs",
    voiceId: "nPczCjzI2devNBz1zQrb",
    voiceName: "Brian",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.3,
      similarityBoost: 0.72,
      style: 0.46,
      speed: 0.86,
      speakerBoost: true
    },
    postProcessing: "None. Candidate for later low room tone or tape layer.",
    samples: {
      intro: "/audio/voice-auditions/intro-brian-close-car.mp3",
      stop: "/audio/voice-auditions/stop-brian-close-car.mp3"
    }
  },
  {
    id: "adam-degraded-transmission",
    label: "Degraded transmission",
    direction: "Firm, lower, and more threatening. Raw source for later signal treatment.",
    provider: "ElevenLabs",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    voiceName: "Adam",
    model: "eleven_multilingual_v2",
    settings: {
      stability: 0.28,
      similarityBoost: 0.7,
      style: 0.52,
      speed: 0.88,
      speakerBoost: true
    },
    postProcessing: "None yet. Listed direction expects optional AM or tape processing later.",
    samples: {
      intro: "/audio/voice-auditions/intro-adam-degraded-transmission.mp3",
      stop: "/audio/voice-auditions/stop-adam-degraded-transmission.mp3"
    }
  }
];

