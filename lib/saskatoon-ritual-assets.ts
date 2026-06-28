export type RitualReviewAsset = {
  stopIndex: number;
  id: string;
  label: string;
  kind: "cue" | "payoff" | "visual" | "physical" | "timer";
  audioFile?: string;
  delayMs?: number;
  probability?: number;
  note: string;
};

const ritualPath = (filename: string) => `/audio/rituals/${filename}`;

export const saskatoonRitualAssets: RitualReviewAsset[] = [
  {
    stopIndex: 1,
    id: "agra-helpme",
    label: "Distant help me",
    kind: "payoff",
    audioFile: ritualPath("agra-helpme.mp3"),
    delayMs: 3600,
    probability: 0.6,
    note: "Distant man's voice, raw and far-off, under the wind."
  },
  {
    stopIndex: 2,
    id: "archaeology-hum",
    label: "Electrical hum",
    kind: "payoff",
    audioFile: ritualPath("archaeology-hum.mp3"),
    delayMs: 1800,
    probability: 0.45,
    note: "Optional faint electrical hum/flicker after the headlight flash."
  },
  {
    stopIndex: 2,
    id: "archaeology-visual",
    label: "Basement lights",
    kind: "visual",
    note: "Primary payoff is visual: the real building flashes back."
  },
  {
    stopIndex: 6,
    id: "collegepark-scream",
    label: "Distant child scream",
    kind: "payoff",
    audioFile: ritualPath("collegepark-scream.mp3"),
    delayMs: 2600,
    probability: 0.55,
    note: "Brief, distant scream after the soap ritual."
  },
  {
    stopIndex: 7,
    id: "devils-tail-visual",
    label: "Shadow tail",
    kind: "visual",
    note: "Visual-only ritual: watch your shadow as you cross."
  },
  {
    stopIndex: 8,
    id: "classical-cue",
    label: "Classical cue",
    kind: "cue",
    audioFile: ritualPath("classical-cue.mp3"),
    note: "Clear app-supplied classical music cue."
  },
  {
    stopIndex: 8,
    id: "davies-classical-echo",
    label: "Classical echo",
    kind: "payoff",
    audioFile: ritualPath("davies-classical-echo.mp3"),
    delayMs: 2400,
    probability: 0.6,
    note: "Warped, faint return of the melody after the cue is cut."
  },
  {
    stopIndex: 11,
    id: "hodgson-knocking",
    label: "Knocking on glass",
    kind: "payoff",
    audioFile: ritualPath("hodgson-knocking.mp3"),
    delayMs: 3800,
    probability: 0.65,
    note: "Slow knocking and a door handle straining around the car."
  },
  {
    stopIndex: 12,
    id: "children-playing",
    label: "Children playing",
    kind: "cue",
    audioFile: ritualPath("children-playing.mp3"),
    note: "Clear app-supplied children laughing/playing cue."
  },
  {
    stopIndex: 12,
    id: "james-anderson-visual",
    label: "Treeline apparition",
    kind: "visual",
    note: "Primary payoff is visual: watch the treeline."
  },
  {
    stopIndex: 13,
    id: "hank-marshmallows",
    label: "Marshmallow offering",
    kind: "physical",
    note: "Physical offering ritual. No app audio required."
  },
  {
    stopIndex: 15,
    id: "pearson-two-minute-timer",
    label: "Two-minute timer",
    kind: "timer",
    note: "Timer ritual with held ambient. No payoff stinger."
  },
  {
    stopIndex: 22,
    id: "confed-drag",
    label: "Wet dragging",
    kind: "payoff",
    audioFile: ritualPath("confed-drag.mp3"),
    delayMs: 3200,
    probability: 0.45,
    note: "Optional very subtle wet dragging/scraping stinger."
  },
  {
    stopIndex: 22,
    id: "confed-visual",
    label: "Crawler shape",
    kind: "visual",
    note: "Primary payoff is visual: watch the ground."
  },
  {
    stopIndex: 24,
    id: "chains-rattling",
    label: "Chains rattling",
    kind: "cue",
    audioFile: ritualPath("chains-rattling.mp3"),
    note: "Clear app-supplied chain rattle cue."
  },
  {
    stopIndex: 24,
    id: "rangeroad-scream",
    label: "Distant scream",
    kind: "payoff",
    audioFile: ritualPath("rangeroad-scream.mp3"),
    delayMs: 3400,
    probability: 0.6,
    note: "Brief distant scream answering the chains."
  },
  {
    stopIndex: 25,
    id: "forestryfarm-howl",
    label: "Wolf howl",
    kind: "payoff",
    audioFile: ritualPath("forestryfarm-howl.mp3"),
    delayMs: 2600,
    probability: 0.7,
    note: "Distant wolf howl answering Zeppelin's name."
  },
  {
    stopIndex: 27,
    id: "shell-station-visual",
    label: "Driver's seat figure",
    kind: "visual",
    note: "Time-gated visual ritual. No app audio required."
  },
  {
    stopIndex: 32,
    id: "blackalley-footsteps-hiss",
    label: "Footsteps and hiss",
    kind: "payoff",
    audioFile: ritualPath("blackalley-footsteps-hiss.mp3"),
    delayMs: 4200,
    probability: 0.6,
    note: "Tiny footsteps circling the car plus a low hiss near the glass."
  },
  {
    stopIndex: 35,
    id: "thorvaldson-knockback",
    label: "Knock-back",
    kind: "payoff",
    audioFile: ritualPath("thorvaldson-knockback.mp3"),
    delayMs: 2600,
    probability: 0.45,
    note: "Optional muffled knock answering from inside the stone."
  },
  {
    stopIndex: 36,
    id: "universitybridge-yes",
    label: "Distant yes",
    kind: "payoff",
    audioFile: ritualPath("universitybridge-yes.mp3"),
    delayMs: 3200,
    probability: 0.65,
    note: "Signature payoff: distant reverbed Yes off concrete."
  },
  {
    stopIndex: 39,
    id: "wiggins-children-distant",
    label: "Distant children",
    kind: "payoff",
    audioFile: ritualPath("wiggins-children-distant.mp3"),
    delayMs: 3600,
    probability: 0.6,
    note: "Distant children laughing and playing out of an empty park."
  }
];

export function ritualAssetsForStop(stopIndex: number) {
  return saskatoonRitualAssets.filter((asset) => asset.stopIndex === stopIndex);
}

export const ritualAudioFiles = saskatoonRitualAssets
  .map((asset) => asset.audioFile)
  .filter((file): file is string => Boolean(file));
