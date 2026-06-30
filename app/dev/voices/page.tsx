import { notFound } from "next/navigation";
import { voiceAuditionCandidates, voiceAuditionPassages } from "@/lib/voice-auditions";
import { VoiceAuditionClient } from "./VoiceAuditionClient";

export const dynamic = "force-dynamic";

function enabledInThisEnvironment() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_AUDIO_REVIEW === "true";
}

export default function VoiceAuditionPage() {
  if (!enabledInThisEnvironment()) {
    notFound();
  }

  return (
    <main className="dev-audio-page voice-audition-page">
      <header className="dev-audio-header">
        <div>
          <span className="kicker">Internal Tool</span>
          <h1>Voice Audition</h1>
          <p>
            Compare saved narration samples on the same script, score the creep factor, and copy the winning voice config.
            Judge on headphones, then in a parked car if possible.
          </p>
        </div>
        <a className="dev-audio-link" href="/dev/audio">
          Audio review
        </a>
      </header>

      <VoiceAuditionClient candidates={voiceAuditionCandidates} passages={voiceAuditionPassages} />
    </main>
  );
}

