"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, FileAudio, Map as MapIcon, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

type StopStatus = "live" | "held";

type AdminStop = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  narrationScript: string;
  safetyWarning: string;
  themeTags: string[];
  status: StopStatus;
};

type TourStop = {
  id: string;
  tourId: string;
  stopId: string;
  position: number;
  isStart: boolean;
  isFinale: boolean;
  stop: AdminStop;
};

type Tour = {
  id: string;
  slug: string;
  title: string;
  targetDurationMinutes: number;
  stops: TourStop[];
};

type Proposal = {
  id: string;
  tourId: string;
  status: string;
  trigger: string;
  currentOrder: string[];
  proposedOrder: string[];
  placementReasons: Array<{ stopId: string; reason: string }>;
  invalidatedLegs: Array<{ fromStopId: string; toStopId: string; reason: string }>;
  issues: string[];
  engineSummary: string;
  durationMinutes: number;
  targetDurationMinutes: number;
  durationDeltaMinutes: number;
  createdAt: string;
  tour: { title: string };
};

type Dashboard = {
  tours: Tour[];
  stops: Array<AdminStop & { tourStops: Array<TourStop & { tour: Tour }> }>;
  proposals: Proposal[];
};

type FormState = {
  id?: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  narrationScript: string;
  safetyWarning: string;
  themeTags: string;
  status: StopStatus;
  tourId: string;
};

const emptyForm: FormState = {
  name: "",
  address: "",
  lat: "",
  lng: "",
  narrationScript: "",
  safetyWarning: "",
  themeTags: "",
  status: "held",
  tourId: ""
};

function stopLabel(stopsById: Map<string, AdminStop>, id: string) {
  return stopsById.get(id)?.name ?? id;
}

function buildMapPoints(stops: AdminStop[]) {
  if (stops.length === 0) {
    return [];
  }

  const minLat = Math.min(...stops.map((stop) => stop.lat));
  const maxLat = Math.max(...stops.map((stop) => stop.lat));
  const minLng = Math.min(...stops.map((stop) => stop.lng));
  const maxLng = Math.max(...stops.map((stop) => stop.lng));
  const latSpan = Math.max(0.01, maxLat - minLat);
  const lngSpan = Math.max(0.01, maxLng - minLng);

  return stops.map((stop) => {
      const x = 18 + ((stop.lng - minLng) / lngSpan) * 264;
      const y = 142 - ((stop.lat - minLat) / latSpan) * 112;
      return { id: stop.id, x, y };
    });
}

export function AdminStopsClient({
  initialDashboard,
  adminEmail
}: {
  initialDashboard: Dashboard;
  adminEmail: string;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    tourId: initialDashboard.tours[0]?.id ?? ""
  }));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedTour = dashboard.tours.find((tour) => tour.id === form.tourId) ?? dashboard.tours[0];
  const latestProposal = dashboard.proposals[0];
  const stopsById = useMemo(() => {
    const map = new Map<string, AdminStop>();
    for (const stop of dashboard.stops) {
      map.set(stop.id, stop);
    }
    return map;
  }, [dashboard.stops]);
  const proposedStops = latestProposal?.proposedOrder.map((id) => stopsById.get(id)).filter((stop): stop is AdminStop => Boolean(stop));
  const proposedPoints = buildMapPoints(proposedStops ?? []);

  function setField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function editStop(stop: AdminStop) {
    setForm({
      id: stop.id,
      name: stop.name,
      address: stop.address ?? "",
      lat: String(stop.lat),
      lng: String(stop.lng),
      narrationScript: stop.narrationScript,
      safetyWarning: stop.safetyWarning,
      themeTags: stop.themeTags.join(", "),
      status: stop.status,
      tourId: selectedTour?.id ?? ""
    });
    setMessage(`Editing ${stop.name}`);
    setError("");
  }

  function requestAdmin(endpoint: string, body: Record<string, unknown>, success: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Admin request failed.");
        return;
      }

      setDashboard(payload.dashboard);
      setMessage(success);
      if (body.action === "create" || body.action === "update") {
        setForm({ ...emptyForm, tourId: form.tourId });
      }
    });
  }

  function saveStop() {
    requestAdmin(
      "/api/admin/stops",
      {
        action: form.id ? "update" : "create",
        id: form.id,
        name: form.name,
        address: form.address,
        lat: form.lat,
        lng: form.lng,
        narrationScript: form.narrationScript,
        safetyWarning: form.safetyWarning,
        themeTags: form.themeTags,
        status: form.status,
        tourId: form.id ? undefined : form.tourId
      },
      form.id ? "Stop updated." : "Stop added. Review the tour proposal before publishing."
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">Dark Drives internal</p>
          <h1>Stop management</h1>
          <p>Signed in as {adminEmail}</p>
        </div>
        <button
          className="admin-icon-button"
          type="button"
          title="New stop"
          onClick={() => setForm({ ...emptyForm, tourId: selectedTour?.id ?? "" })}
        >
          <Plus aria-hidden="true" />
        </button>
      </header>

      {message ? <p className="admin-notice">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-grid">
        <div className="admin-panel admin-panel-wide">
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">Tour order</p>
              <h2>{selectedTour?.title ?? "No tour"}</h2>
            </div>
            <select value={form.tourId} onChange={(event) => setField("tourId", event.target.value)}>
              {dashboard.tours.map((tour) => (
                <option key={tour.id} value={tour.id}>
                  {tour.title}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-stop-list">
            {selectedTour?.stops.map((membership) => (
              <button key={membership.id} className="admin-stop-row" type="button" onClick={() => editStop(membership.stop)}>
                <span>{String(membership.position).padStart(2, "0")}</span>
                <strong>{membership.stop.name}</strong>
                <em>{membership.isStart ? "Start" : membership.isFinale ? "Finale" : membership.stop.status}</em>
              </button>
            ))}
          </div>

          <button
            className="admin-action"
            type="button"
            disabled={!selectedTour || isPending}
            onClick={() =>
              requestAdmin(
                "/api/admin/proposals",
                {
                  action: "create",
                  tourId: selectedTour?.id,
                  trigger: "Operator requested ordering review"
                },
                "Ordering proposal created."
              )
            }
          >
            <RefreshCw aria-hidden="true" />
            Suggest order
          </button>
        </div>

        <form className="admin-panel admin-form" onSubmit={(event) => event.preventDefault()}>
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">{form.id ? "Edit stop" : "Add stop"}</p>
              <h2>Metadata</h2>
            </div>
            <select value={form.status} onChange={(event) => setField("status", event.target.value as StopStatus)}>
              <option value="held">Held</option>
              <option value="live">Live</option>
            </select>
          </div>

          <label>
            Name
            <input value={form.name} onChange={(event) => setField("name", event.target.value)} />
          </label>
          <label>
            Address or vantage point
            <input value={form.address} onChange={(event) => setField("address", event.target.value)} />
          </label>
          <div className="admin-two">
            <label>
              Latitude
              <input value={form.lat} onChange={(event) => setField("lat", event.target.value)} />
            </label>
            <label>
              Longitude
              <input value={form.lng} onChange={(event) => setField("lng", event.target.value)} />
            </label>
          </div>
          <label>
            Theme tags
            <input value={form.themeTags} onChange={(event) => setField("themeTags", event.target.value)} />
          </label>
          <label>
            Safety and warning copy
            <textarea value={form.safetyWarning} onChange={(event) => setField("safetyWarning", event.target.value)} />
          </label>
          <label>
            Narration script
            <textarea value={form.narrationScript} onChange={(event) => setField("narrationScript", event.target.value)} />
          </label>
          <div className="admin-toolbar">
            <button className="admin-action" type="button" disabled={isPending} onClick={saveStop}>
              <Save aria-hidden="true" />
              Save stop
            </button>
            {form.id ? (
              <button
                className="admin-danger"
                type="button"
                disabled={isPending}
                onClick={() =>
                  requestAdmin(
                    "/api/admin/stops",
                    { action: "delete", id: form.id },
                    "Stop removed. Review the affected tour before publishing."
                  )
                }
              >
                <Trash2 aria-hidden="true" />
                Remove
              </button>
            ) : null}
          </div>
        </form>

        <section className="admin-panel admin-panel-wide">
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">Reviewed suggestion</p>
              <h2>{latestProposal ? latestProposal.tour.title : "No proposal yet"}</h2>
            </div>
            {latestProposal ? <span className="admin-status">{latestProposal.status}</span> : null}
          </div>

          {latestProposal ? (
            <>
              <div className="admin-metrics">
                <div>
                  <span>Estimate</span>
                  <strong>{latestProposal.durationMinutes} min</strong>
                </div>
                <div>
                  <span>Target</span>
                  <strong>{latestProposal.targetDurationMinutes} min</strong>
                </div>
                <div>
                  <span>Delta</span>
                  <strong>{latestProposal.durationDeltaMinutes > 0 ? "+" : ""}{latestProposal.durationDeltaMinutes}</strong>
                </div>
              </div>

              <div className="admin-diff">
                {latestProposal.proposedOrder.map((stopId, index) => {
                  const currentIndex = latestProposal.currentOrder.indexOf(stopId);
                  const moved = currentIndex !== index;
                  return (
                    <div key={stopId} data-moved={moved}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{stopLabel(stopsById, stopId)}</strong>
                      <em>{moved ? `from ${currentIndex + 1}` : "same"}</em>
                    </div>
                  );
                })}
              </div>

              <div className="admin-map">
                <div className="admin-section-title">
                  <MapIcon aria-hidden="true" />
                  Route preview
                </div>
                <svg viewBox="0 0 300 160" role="img" aria-label="Proposed route map preview">
                  <polyline points={proposedPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")} />
                  {proposedPoints.map((point, index) => (
                    <circle key={point.id} cx={point.x} cy={point.y} r={index === 0 ? 5 : 4} />
                  ))}
                </svg>
              </div>

              <div className="admin-split">
                <div>
                  <div className="admin-section-title">
                    <FileAudio aria-hidden="true" />
                    Leg audio to regenerate
                  </div>
                  {latestProposal.invalidatedLegs.length ? (
                    latestProposal.invalidatedLegs.map((leg) => (
                      <p key={`${leg.fromStopId}-${leg.toStopId}`} className="admin-callout">
                        {stopLabel(stopsById, leg.fromStopId)} to {stopLabel(stopsById, leg.toStopId)}
                      </p>
                    ))
                  ) : (
                    <p className="admin-muted">No drive-leg audio changes detected.</p>
                  )}
                </div>

                <div>
                  <div className="admin-section-title">
                    <AlertTriangle aria-hidden="true" />
                    Issues
                  </div>
                  {latestProposal.issues.length ? (
                    latestProposal.issues.map((issue) => (
                      <p key={issue} className="admin-callout">
                        {issue}
                      </p>
                    ))
                  ) : (
                    <p className="admin-muted">No flagged issues.</p>
                  )}
                </div>
              </div>

              <div className="admin-reasons">
                {latestProposal.placementReasons.map((item) => (
                  <p key={item.stopId}>
                    <strong>{stopLabel(stopsById, item.stopId)}</strong>
                    {item.reason}
                  </p>
                ))}
              </div>

              <p className="admin-muted">{latestProposal.engineSummary}</p>

              <button
                className="admin-action"
                type="button"
                disabled={isPending || latestProposal.status === "published"}
                onClick={() =>
                  requestAdmin(
                    "/api/admin/proposals",
                    { action: "publish", proposalId: latestProposal.id },
                    "Proposal published to the admin catalog."
                  )
                }
              >
                <Check aria-hidden="true" />
                Approve and publish order
              </button>
            </>
          ) : (
            <p className="admin-muted">Create a suggestion to review route order, narrative reasoning, duration, and stale drive-leg audio.</p>
          )}
        </section>
      </section>
    </main>
  );
}
