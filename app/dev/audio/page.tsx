import { notFound } from "next/navigation";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fakeRoute, getRouteAssetUrls } from "@/lib/route-data";
import { saskatoonAll40AudioPath, saskatoonAll40Stops } from "@/lib/saskatoon-all-40-scripts";
import { ritualAssetsForStop } from "@/lib/saskatoon-ritual-assets";

export const dynamic = "force-dynamic";

function enabledInThisEnvironment() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_AUDIO_REVIEW === "true";
}

function filenameFromUrl(url: string) {
  return url.split("?")[0].split("/").filter(Boolean).at(-1) ?? url;
}

function publicPathForUrl(url: string) {
  return path.join(process.cwd(), "public", url.split("?")[0]);
}

function cacheBustedAudioUrl(url: string) {
  const filePath = publicPathForUrl(url);

  if (!existsSync(filePath)) {
    return url;
  }

  const version = Math.round(statSync(filePath).mtimeMs);
  return `${url}?v=${version}`;
}

function generatedAudioUrl(id: string) {
  const url = `/audio/elevenlabs-review/${id}.mp3`;
  const filePath = publicPathForUrl(url);
  return existsSync(filePath) ? url : null;
}

function publicAssetExists(url: string) {
  return existsSync(publicPathForUrl(url));
}

export default function DevAudioReviewPage() {
  if (!enabledInThisEnvironment()) {
    notFound();
  }

  const route = fakeRoute;
  const cachedAssets = getRouteAssetUrls(route);
  const introDraft = generatedAudioUrl("intro");
  const outroDraft = generatedAudioUrl("outro");
  const showIntroDraft = introDraft && introDraft !== route.introAudio;
  const showOutroDraft = outroDraft && outroDraft !== route.outroAudio;

  return (
    <main className="dev-audio-page">
      <header className="dev-audio-header">
        <div>
          <span className="kicker">Developer Review</span>
          <h1>{route.title}</h1>
          <p>{route.blurb}</p>
        </div>
        <a className="dev-audio-link" href="/">
          Open player
        </a>
      </header>

      <section className="dev-audio-grid" aria-label="Route-level audio">
        <article className="dev-audio-card">
          <div className="file-row">
            <span className="file-tab">ROUTE INTRO</span>
            <span className="sealed">{filenameFromUrl(route.introAudio)}</span>
          </div>
          <h2>Intro</h2>
          <p>{route.introScript}</p>
          <audio controls preload="metadata" src={cacheBustedAudioUrl(route.introAudio)} />
          {showIntroDraft ? (
            <div className="dev-audio-player">
              <span>ElevenLabs draft: {filenameFromUrl(introDraft)}</span>
              <audio controls preload="metadata" src={cacheBustedAudioUrl(introDraft)} />
            </div>
          ) : !introDraft ? (
            <p className="dev-audio-missing">No ElevenLabs draft generated yet.</p>
          ) : null}
        </article>

        <article className="dev-audio-card">
          <div className="file-row">
            <span className="file-tab">ROUTE OUTRO</span>
            <span className="sealed">{filenameFromUrl(route.outroAudio)}</span>
          </div>
          <h2>Outro</h2>
          <p>{route.outroScript}</p>
          <audio controls preload="metadata" src={cacheBustedAudioUrl(route.outroAudio)} />
          {showOutroDraft ? (
            <div className="dev-audio-player">
              <span>ElevenLabs draft: {filenameFromUrl(outroDraft)}</span>
              <audio controls preload="metadata" src={cacheBustedAudioUrl(outroDraft)} />
            </div>
          ) : !outroDraft ? (
            <p className="dev-audio-missing">No ElevenLabs draft generated yet.</p>
          ) : null}
        </article>
      </section>

      <section className="dev-audio-list" aria-label="Stop audio review">
        {saskatoonAll40Stops.map((stop) => {
          const audioUrl = saskatoonAll40AudioPath(stop);
          const hasAudio = publicAssetExists(audioUrl);
          const ritualAssets = ritualAssetsForStop(stop.index);

          return (
            <article className={`dev-audio-card ${!hasAudio ? "dev-audio-card-pending" : ""}`} key={stop.id}>
              <div className="file-row">
                <span className="file-tab">STOP {String(stop.index).padStart(2, "0")}</span>
                <span className="sealed">{hasAudio ? "ready" : "scripted"}</span>
              </div>
              <div className="dev-audio-card-header">
                <div>
                  <h2>{stop.title}</h2>
                  <p>{stop.ritualCue ? "Ritual stop" : "Narration stop"}</p>
                </div>
                <span className="dev-audio-meta">{hasAudio ? "AUDIO" : "SCRIPT"}</span>
              </div>

              {hasAudio ? (
                <div className="dev-audio-player">
                  <span>Narration: {filenameFromUrl(audioUrl)}</span>
                  <audio controls preload="metadata" src={cacheBustedAudioUrl(audioUrl)} />
                </div>
              ) : (
                <p className="dev-audio-missing">No generated audio yet: {filenameFromUrl(audioUrl)}</p>
              )}

              {stop.ritualCue && (
                <div className="dev-audio-script">
                  <strong>Ritual cue</strong>
                  <p>{stop.ritualCue}</p>
                </div>
              )}

              {ritualAssets.length > 0 && (
                <div className="dev-audio-script">
                  <strong>Ritual audio/effects</strong>
                  {ritualAssets.map((asset) => {
                    const hasRitualAudio = asset.audioFile ? publicAssetExists(asset.audioFile) : false;

                    return (
                      <div className="dev-audio-player" key={asset.id}>
                        <p>
                          {asset.label} [{asset.kind}]
                          {asset.delayMs ? ` / ${asset.delayMs}ms` : ""}
                          {asset.probability ? ` / ${Math.round(asset.probability * 100)}%` : ""}
                        </p>
                        <p>{asset.note}</p>
                        {asset.audioFile && hasRitualAudio && (
                          <>
                            <span>Ritual asset: {filenameFromUrl(asset.audioFile)}</span>
                            <audio controls preload="metadata" src={cacheBustedAudioUrl(asset.audioFile)} />
                          </>
                        )}
                        {asset.audioFile && !hasRitualAudio && (
                          <p className="dev-audio-missing">Missing ritual asset: {filenameFromUrl(asset.audioFile)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="dev-audio-script">
                <strong>Review script</strong>
                <p>{stop.script}</p>
              </div>

              <p className="dev-audio-safety">{stop.safetyNote}</p>
            </article>
          );
        })}
      </section>

      <section className="dev-audio-card">
        <div className="file-row">
          <span className="file-tab">CACHE MANIFEST</span>
          <span className="sealed">{cachedAssets.length} ASSETS</span>
        </div>
        <ul className="dev-audio-assets">
          {cachedAssets.map((asset) => (
            <li key={asset}>{asset}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
