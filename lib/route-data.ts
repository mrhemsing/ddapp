export type RouteAudio = {
  narrationFile: string;
  ambientFile?: string;
  durationSec: number;
  reviewScript?: string;
};

export type Ritual = {
  id: string;
  label: string;
  type: "audioCue" | "instruction";
  cueAudio?: string;
  instructionText: string;
  visualOnly?: boolean;
  payoff?: {
    audioFile: string;
    delayMs: number;
    probability: number;
  };
};

export type Stop = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  parkPoint?: {
    lat: number;
    lng: number;
    label: string;
  };
  approachRadiusM: number;
  arriveRadiusM: number;
  story: {
    teaser: string;
    body: string;
  };
  audio: RouteAudio;
  safetyNote?: string;
  driveToNextAudio?: string;
  driveToNextScript?: string;
  rituals?: Ritual[];
};

export type SealedStop = {
  id: string;
  title: string;
  order: number;
  reason: string;
  story: {
    teaser: string;
    body: string;
  };
  safetyNote?: string;
};

export type RouteLoop = {
  id: string;
  title: string;
  subtitle: string;
  estimatedDuration: string;
  stopIds: string[];
};

export type RoutePack = {
  id: string;
  title: string;
  blurb: string;
  introAudio: string;
  introScript?: string;
  outroAudio: string;
  outroScript?: string;
  stops: Stop[];
  sealedStops?: SealedStop[];
  loops?: RouteLoop[];
};

export const fakeRoute: RoutePack = {
  id: "saskatoon-p0-slice",
  title: "The Dark Side of Saskatoon",
  blurb: "Enhanced v2 sample route with real legends, rituals, and review audio.",
  introAudio: "/audio/elevenlabs-review/intro.mp3",
  introScript: `Everything you are about to hear is tied to a real place in Saskatoon. I will be your guide as we explore the cities most haunted roads, parks and landmarks.

Saskatoon looks ordinary in the daylight. A river. A few bridges. Quiet streets that run out into fields. But after dark the city keeps a second set of records, and tonight, I will be reading them out loud.

Here are the rules. Stay in the car unless we tell you it is safe to step out. Keep your doors locked. Keep your voices down, because some of these places answer back. When the screen turns red, you have arrived. That is when one of you presses play, and the rest of you stop talking.

This is The Dark Side of Saskatoon.
Forty real places known to have paranormal activity.

Drive safe. Drive sober. Stick to the map and do not trespass on private property.

Now let's begin...`,
  outroAudio: "/audio/elevenlabs-review/outro.mp3",
  outroScript: `That was the last file. The route is closed.

You drove every road we pointed you down. You heard what this city does not print on its maps. And whatever moved closer to the car tonight, it does not need the road anymore. It knows the car now.

If the quiet in here feels heavier than it did at the start, that is normal. Most people do not sleep well after their first drive.

Lock your doors tonight anyway.

And tell your friends what happened out here. Just leave out the parts they would never believe.`,
  stops: [
    {
      id: "woodlawn",
      title: "Woodlawn Cemetery",
      lat: 52.1541,
      lng: -106.6572,
      parkPoint: {
        lat: 52.1536,
        lng: -106.6576,
        label: "Public road vantage point"
      },
      approachRadiusM: 250,
      arriveRadiusM: 60,
      story: {
        teaser: "Lock your doors. Press play. And do not stop until the road ends.",
        body: "Woodlawn Cemetery sits behind iron and a row of old trees that have watched this city grow up around them."
      },
      audio: {
        narrationFile: "/audio/elevenlabs-review/01-woodlawn.mp3",
        ambientFile: "/audio/ambient-low.wav",
        durationSec: 80,
        reviewScript: `Woodlawn Cemetery sits behind iron and a row of old trees that have watched this city grow up around them. Some of the people buried here came before the streets did.

Roll past slowly. Keep your hands inside the car.

They say an old woman walks the rows at night. Going somewhere. Looking for someone she never finds. People have watched her move between the headstones and then simply stop being there. On the worst nights there is more than one of them, pale shapes drifting low over the ground where the oldest graves are.

And then there is the other one. The presence. Nobody who has seen it can describe a face. They only describe the eyes. Completely black, with no light in them at all. Or worse, a dull green and red glow burning where the eyes should be, watching the road from somewhere inside the dark.

If you feel watched here, you are not imagining it. Keep your lights low. And listen for the one sound out there that does not move like wind.`
      },
      safetyNote: "Stay in the car. Park lawfully and respect cemetery hours.",
      driveToNextAudio: "/audio/elevenlabs-review/leg-woodlawn-to-university-bridge.mp3",
      driveToNextScript:
        "Pull out slow, and point the car toward the river. We are going to the University Bridge. Thousands of people cross it every day without ever thinking about what is inside it. You are about to. Keep your windows up for now. You will want them down soon enough."
    },
    {
      id: "university-bridge",
      title: "University Bridge",
      lat: 52.1262,
      lng: -106.6503,
      parkPoint: {
        lat: 52.1256,
        lng: -106.6512,
        label: "Legal public stopping point"
      },
      approachRadiusM: 260,
      arriveRadiusM: 70,
      story: {
        teaser: "The river carries sound differently after dark.",
        body: "The legend says one of the men working the forms went into the concrete in the dark."
      },
      audio: {
        narrationFile: "/audio/elevenlabs-review/02-university-bridge.mp3",
        ambientFile: "/audio/ambient-low.wav",
        durationSec: 85,
        reviewScript: `The University Bridge has carried this city across the river for more than a hundred years. Most people only think about the traffic on top of it. Tonight, think about what is inside it.

When they built the bridge, the work was hard and the records were thin. The legend says one of the men working the forms went into the concrete in the dark. Fell into the wet pour, and it set around him before anyone understood he was gone. No body was ever recovered. There was nowhere to look. He had already become part of the bridge.

They say he is still in there. Still aware. Still waiting for someone to finally notice him.

So here is what you do. Find the underside of the bridge, on either bank, somewhere you can stop safely and within the law. Roll one window down. And one of you call out to him, clearly. Ask him: are you trapped.

Then everyone stops talking. And you listen to what comes back off the concrete.

The ones who have done this swear they got an answer. One word, in a voice that was never in the car. Yes.`
      },
      safetyNote: "View from a legal public stopping point. Do not block traffic.",
      driveToNextAudio: "/audio/elevenlabs-review/leg-university-bridge-to-james-anderson.mp3",
      driveToNextScript:
        "Windows back up. We are leaving the river behind. The next one does not scream, and it does not rattle the doors. It only watches. And it has been waiting a long time for someone to bring back a sound it remembers. Drive on. James Anderson Park is ahead.",
      rituals: [
        {
          id: "ask-trapped",
          label: "Ask him",
          type: "instruction",
          instructionText: "Ask him: ARE YOU TRAPPED? Then stop talking and listen.",
          payoff: {
            audioFile: "/audio/rituals/universitybridge-yes.mp3",
            delayMs: 3200,
            probability: 0.65
          }
        }
      ]
    },
    {
      id: "james-anderson",
      title: "James Anderson Park",
      lat: 52.1101,
      lng: -106.6187,
      approachRadiusM: 240,
      arriveRadiusM: 65,
      story: {
        teaser: "The playground is only quiet until someone listens.",
        body: "James Anderson Park is too still at night. The swings hang like they are waiting for permission to move."
      },
      audio: {
        narrationFile: "/audio/elevenlabs-review/03-james-anderson.mp3",
        ambientFile: "/audio/ambient-low.wav",
        durationSec: 80,
        reviewScript: `James Anderson Park is too still at night. The swings hang like they are waiting for permission to move.

There was a man who lived back in the treeline here, years ago. No house. No name anyone bothered to learn. By day this field filled up with kids, and the sound of them carried all the way to the trees, and that sound was the one thing that pulled him to the edge of the dark to listen. He never came closer than that. He just stood at the treeline, and he listened.

One night a group of older kids found him out here and decided he did not belong. The story says he never got up off the grass they left him on. The field went quiet. And he never really left it.

They say he still answers the sound he loved. So give it to him. Play a recording of children laughing and playing, turn it up until it carries out across the field, and then watch the inside of the treeline.

Scan slow. Look for an old man. Long grey beard. An old ball cap. Standing just inside the trees, watching the field. Watching you.

And understand that by the time you find him, he will have already found you.`
      },
      safetyNote: "Stay in the car and use legal parking only.",
      rituals: [
        {
          id: "children-laughing",
          label: "Play laughter",
          type: "audioCue",
          cueAudio: "/audio/rituals/children-playing.mp3",
          instructionText: "Play the children laughing. Then watch the treeline.",
          visualOnly: true
        }
      ]
    }
  ]
};

export function getRouteAssetUrls(route: RoutePack): string[] {
  const urls = new Set<string>([route.introAudio, route.outroAudio]);

  for (const stop of route.stops) {
    urls.add(stop.audio.narrationFile);
    if (stop.audio.ambientFile) {
      urls.add(stop.audio.ambientFile);
    }
    if (stop.driveToNextAudio) {
      urls.add(stop.driveToNextAudio);
    }
    for (const ritual of stop.rituals ?? []) {
      if (ritual.cueAudio) {
        urls.add(ritual.cueAudio);
      }
      if (ritual.payoff?.audioFile) {
        urls.add(ritual.payoff.audioFile);
      }
    }
  }

  return [...urls];
}
