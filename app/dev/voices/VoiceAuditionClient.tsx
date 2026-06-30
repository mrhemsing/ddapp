"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VoiceAuditionCandidate, VoiceAuditionPassageId } from "@/lib/voice-auditions";

const voiceAuditionStorageKey = "dark-drives:voice-auditions:v1";

type VoiceAuditionScore = {
  score: number;
  note: string;
};

type VoiceAuditionClientProps = {
  candidates: VoiceAuditionCandidate[];
  passages: Array<{
    id: VoiceAuditionPassageId;
    label: string;
    description: string;
    script: string;
  }>;
};

function shuffle<T>(items: T[]) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function scoreKey(passageId: VoiceAuditionPassageId, candidateId: string) {
  return `${passageId}:${candidateId}`;
}

function candidateConfig(candidate: VoiceAuditionCandidate) {
  return {
    label: candidate.label,
    direction: candidate.direction,
    provider: candidate.provider,
    voiceId: candidate.voiceId,
    voiceName: candidate.voiceName,
    model: candidate.model,
    settings: candidate.settings,
    postProcessing: candidate.postProcessing
  };
}

export function VoiceAuditionClient({ candidates, passages }: VoiceAuditionClientProps) {
  const [passageId, setPassageId] = useState<VoiceAuditionPassageId>(passages[0]?.id ?? "intro");
  const [scores, setScores] = useState<Record<string, VoiceAuditionScore>>({});
  const [rankByScore, setRankByScore] = useState(true);
  const [blindMode, setBlindMode] = useState(false);
  const [blindRevealed, setBlindRevealed] = useState(false);
  const [blindOrder, setBlindOrder] = useState<string[]>(() => candidates.map((candidate) => candidate.id));
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    const stored = window.localStorage.getItem(voiceAuditionStorageKey);
    if (!stored) {
      return;
    }

    try {
      setScores(JSON.parse(stored) as Record<string, VoiceAuditionScore>);
    } catch {
      window.localStorage.removeItem(voiceAuditionStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(voiceAuditionStorageKey, JSON.stringify(scores));
  }, [scores]);

  const activePassage = passages.find((passage) => passage.id === passageId) ?? passages[0];
  const allRated = candidates.every((candidate) => (scores[scoreKey(passageId, candidate.id)]?.score ?? 0) > 0);

  const orderedCandidates = useMemo(() => {
    if (blindMode) {
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      return blindOrder.map((id) => candidateById.get(id)).filter((candidate): candidate is VoiceAuditionCandidate => Boolean(candidate));
    }

    if (!rankByScore) {
      return candidates;
    }

    return [...candidates].sort((a, b) => {
      const bScore = scores[scoreKey(passageId, b.id)]?.score ?? 0;
      const aScore = scores[scoreKey(passageId, a.id)]?.score ?? 0;
      return bScore - aScore;
    });
  }, [blindMode, blindOrder, candidates, passageId, rankByScore, scores]);

  function updateScore(candidateId: string, update: Partial<VoiceAuditionScore>) {
    const key = scoreKey(passageId, candidateId);
    setScores((current) => ({
      ...current,
      [key]: {
        score: current[key]?.score ?? 0,
        note: current[key]?.note ?? "",
        ...update
      }
    }));
  }

  function pauseOthers(activeKey: string) {
    for (const [key, audio] of Object.entries(audioRefs.current)) {
      if (key !== activeKey) {
        audio?.pause();
      }
    }
  }

  function toggleBlindMode() {
    const nextBlindMode = !blindMode;
    setBlindMode(nextBlindMode);
    setBlindRevealed(false);
    setBlindOrder(nextBlindMode ? shuffle(candidates.map((candidate) => candidate.id)) : candidates.map((candidate) => candidate.id));
  }

  async function copyConfig(candidate: VoiceAuditionCandidate) {
    await navigator.clipboard.writeText(JSON.stringify(candidateConfig(candidate), null, 2));
    setCopiedCandidateId(candidate.id);
    window.setTimeout(() => setCopiedCandidateId(null), 1400);
  }

  return (
    <div className="voice-audition-shell">
      <section className="voice-audition-toolbar" aria-label="Audition controls">
        <div className="voice-audition-tabs" role="tablist" aria-label="Test passage">
          {passages.map((passage) => (
            <button
              aria-selected={passage.id === passageId}
              key={passage.id}
              onClick={() => setPassageId(passage.id)}
              role="tab"
              type="button"
            >
              {passage.label}
            </button>
          ))}
        </div>
        <label className="voice-audition-toggle">
          <input checked={rankByScore} disabled={blindMode} onChange={(event) => setRankByScore(event.target.checked)} type="checkbox" />
          Rank by score
        </label>
        <button className="voice-audition-action" onClick={toggleBlindMode} type="button">
          {blindMode ? "Exit blind mode" : "Blind mode"}
        </button>
        {blindMode && (
          <button className="voice-audition-action" disabled={!allRated} onClick={() => setBlindRevealed(true)} type="button">
            Reveal identities
          </button>
        )}
      </section>

      <section className="voice-audition-script" aria-label="Current script">
        <div>
          <span className="kicker">Script</span>
          <h2>{activePassage.label}</h2>
          <p>{activePassage.description}</p>
        </div>
        <pre>{activePassage.script}</pre>
      </section>

      <section className="voice-audition-grid" aria-label="Voice candidates">
        {orderedCandidates.map((candidate, index) => {
          const hidden = blindMode && !blindRevealed;
          const key = scoreKey(passageId, candidate.id);
          const score = scores[key]?.score ?? 0;
          const note = scores[key]?.note ?? "";
          const sampleKey = `${candidate.id}:${passageId}`;

          return (
            <article className="voice-audition-card" data-control={candidate.isControl} key={candidate.id}>
              <div className="voice-audition-card-head">
                <div>
                  <span className="file-tab">{hidden ? `Voice ${String(index + 1).padStart(2, "0")}` : candidate.provider}</span>
                  <h3>{hidden ? "Hidden voice" : candidate.label}</h3>
                  <p>{hidden ? "Identity hidden until reveal." : candidate.direction}</p>
                </div>
                <span className="sealed">{candidate.isControl && !hidden ? "control" : `Score ${score || "open"}`}</span>
              </div>

              <audio
                controls
                onPlay={() => pauseOthers(sampleKey)}
                preload="metadata"
                ref={(element) => {
                  audioRefs.current[sampleKey] = element;
                }}
                src={candidate.samples[passageId]}
              />

              {!hidden && (
                <dl className="voice-audition-config">
                  <div><dt>Voice ID</dt><dd>{candidate.voiceId}</dd></div>
                  <div><dt>Voice</dt><dd>{candidate.voiceName}</dd></div>
                  <div><dt>Model</dt><dd>{candidate.model}</dd></div>
                  <div><dt>Stability</dt><dd>{candidate.settings.stability}</dd></div>
                  <div><dt>Similarity</dt><dd>{candidate.settings.similarityBoost}</dd></div>
                  <div><dt>Style</dt><dd>{candidate.settings.style}</dd></div>
                  <div><dt>Speed</dt><dd>{candidate.settings.speed}</dd></div>
                  <div><dt>Boost</dt><dd>{candidate.settings.speakerBoost ? "on" : "off"}</dd></div>
                  <div className="voice-audition-config-wide"><dt>Processing</dt><dd>{candidate.postProcessing}</dd></div>
                </dl>
              )}

              <div className="voice-audition-score" aria-label={`Creep score for ${hidden ? `voice ${index + 1}` : candidate.label}`}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-pressed={score === value}
                    key={value}
                    onClick={() => updateScore(candidate.id, { score: value })}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>

              <textarea
                aria-label={`Notes for ${hidden ? `voice ${index + 1}` : candidate.label}`}
                onChange={(event) => updateScore(candidate.id, { note: event.target.value })}
                placeholder="Notes"
                value={note}
              />

              {!hidden && (
                <button className="voice-audition-copy" onClick={() => void copyConfig(candidate)} type="button">
                  {copiedCandidateId === candidate.id ? "Copied" : "Copy full config"}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
