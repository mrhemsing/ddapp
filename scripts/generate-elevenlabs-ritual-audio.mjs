import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Local .env is optional; deployment/CI can provide env vars directly.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const outputDir = path.join(process.cwd(), "public", "audio", "rituals");

if (!apiKey) {
  throw new Error("Missing ELEVENLABS_API_KEY.");
}

const ritualAssets = [
  {
    filename: "children-playing.mp3",
    title: "James Anderson children cue",
    duration_seconds: 12,
    prompt_influence: 0.38,
    text:
      "Original field recording style audio of children laughing and playing in a park at night, clear enough to play from a car speaker, no music, no words, natural outdoor space, slightly eerie but usable as a ritual cue."
  },
  {
    filename: "chains-rattling.mp3",
    title: "Range Road chains cue",
    duration_seconds: 8,
    prompt_influence: 0.45,
    text:
      "Clear original sound effect of heavy metal chains rattling and shaking outdoors at night, close enough to be obvious through a car speaker, no voices, no music, usable as a ritual cue."
  },
  {
    filename: "classical-cue.mp3",
    title: "E.A. Davies classical cue",
    duration_seconds: 14,
    prompt_influence: 0.34,
    text:
      "Short original public-domain-style classical piano phrase, simple old recital room feeling, clear and audible, no modern production, no voices, suitable as a ritual cue played from a car."
  },
  {
    filename: "agra-helpme.mp3",
    title: "Agra Road help me payoff",
    duration_seconds: 4,
    prompt_influence: 0.72,
    text:
      "A distant male voice saying help me twice, raw and far away under night wind, heavily reverberated and degraded, low in the mix, subtle paranormal payoff, not clean, not loud, no music."
  },
  {
    filename: "archaeology-hum.mp3",
    title: "Archaeology building hum payoff",
    duration_seconds: 4,
    prompt_influence: 0.55,
    text:
      "A faint electrical hum and fluorescent light flicker from inside an empty basement at night, subtle and distant, low volume, eerie but not dramatic, no voices, no music."
  },
  {
    filename: "collegepark-scream.mp3",
    title: "College Park scream payoff",
    duration_seconds: 3,
    prompt_influence: 0.62,
    text:
      "A very brief distant child scream from far across an empty schoolyard at night, heavily softened by distance and air, subtle paranormal stinger, not loud, not graphic, no music."
  },
  {
    filename: "davies-classical-echo.mp3",
    title: "Davies classical echo payoff",
    duration_seconds: 6,
    prompt_influence: 0.6,
    text:
      "A faint warped echo of old classical piano returning from an empty stone school building, slowed, detuned, drowned in reverb, distant and unsettling, low in the mix, no voices."
  },
  {
    filename: "hodgson-knocking.mp3",
    title: "Hodgson knocking payoff",
    duration_seconds: 7,
    prompt_influence: 0.68,
    text:
      "Slow deliberate knocking on car glass moving from one side to another, then a car door handle straining gently, outdoor night ambience, subtle and close but not loud, no voices, no music."
  },
  {
    filename: "rangeroad-scream.mp3",
    title: "Range Road scream payoff",
    duration_seconds: 4,
    prompt_influence: 0.62,
    text:
      "A brief distant woman's scream answering from empty rural darkness after a beat of silence, far-off and reverberated, subtle and not gratuitous, low in the mix, no music."
  },
  {
    filename: "forestryfarm-howl.mp3",
    title: "Forestry Farm howl payoff",
    duration_seconds: 5,
    prompt_influence: 0.58,
    text:
      "A distant wolf howl from across dark open fields near water, gentle but eerie, natural outdoor night ambience, slightly clearer than other stingers, no music, no human voices."
  },
  {
    filename: "blackalley-footsteps-hiss.mp3",
    title: "Black Alley footsteps payoff",
    duration_seconds: 7,
    prompt_influence: 0.68,
    text:
      "Tiny quick footsteps circling close around a parked car in a dark alley, with a low hiss near the glass, subtle positional-feeling stinger, low in the mix, no music, no voices."
  },
  {
    filename: "universitybridge-yes.mp3",
    title: "University Bridge yes payoff",
    duration_seconds: 4,
    prompt_influence: 0.7,
    text:
      "A single distant male voice saying yes, heavily reverberated as if reflected off concrete under a bridge, low in the mix, degraded, half buried in night air, subtle paranormal stinger, not clean, not loud, no music."
  },
  {
    filename: "wiggins-children-distant.mp3",
    title: "Wiggins distant children payoff",
    duration_seconds: 7,
    prompt_influence: 0.5,
    text:
      "Distant children laughing and playing in an empty park at three in the morning, far away, ghostly and softened by night air, low in the mix, no music, subtle paranormal stinger."
  },
  {
    filename: "confed-drag.mp3",
    title: "Confed Crawler drag payoff",
    duration_seconds: 5,
    prompt_influence: 0.6,
    text:
      "Very subtle wet dragging and scraping sound across pavement behind a building at night, low and distant, unsettling but quiet, no voices, no music."
  },
  {
    filename: "thorvaldson-knockback.mp3",
    title: "Thorvaldson knock-back payoff",
    duration_seconds: 4,
    prompt_influence: 0.58,
    text:
      "A muffled knock answering back from inside a large concrete block, low and dull, followed by silence, subtle and distant, no voices, no music."
  }
];

await mkdir(outputDir, { recursive: true });

for (const asset of ritualAssets) {
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: asset.text,
      duration_seconds: asset.duration_seconds,
      prompt_influence: asset.prompt_influence
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs sound generation failed for ${asset.title}: ${response.status} ${errorText}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(outputDir, asset.filename), audio);
  console.log(`Generated ${asset.filename} (${audio.length} bytes)`);
}
