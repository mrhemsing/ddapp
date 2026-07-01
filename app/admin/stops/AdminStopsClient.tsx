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
  narrationAudio: string | null;
  driveToNextAudio: string | null;
  audioStatus: string;
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
  currentOrder: string[];
  proposedOrder: string[];
  placementReasons: Array<{ stopId: string; reason: string }>;
  invalidatedLegs: Array<{ fromStopId: string; toStopId: string; reason: string }>;
  issues: string[];
  engineSummary: string;
  durationMinutes: number;
  targetDurationMinutes: number;
  durationDeltaMinutes: number;
  tour: { title: string };
};

type Dashboard = {
  tours: Tour[];
  stops: Array<AdminStop & { tourStops: Array<TourStop & { tour: Tour }> }>;
  proposals: Proposal[];
};

type StopForm = {
  id?: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  narrationScript: string;
  safetyWarning: string;
  themeTags: string;
  status: StopStatus;
};

type MembershipForm = {
  id?: string;
  stopId: string;
  position: string;
  isStart: boolean;
  isFinale: boolean;
  narrationAudio: string;
  driveToNextAudio: string;
  audioStatus: string;
};

type MapPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
};

const emptyStopForm: StopForm = {
  name: "",
  address: "",
  lat: "",
  lng: "",
  narrationScript: "",
  safetyWarning: "",
  themeTags: "",
  status: "held"
};

const emptyMembershipForm: MembershipForm = {
  stopId: "",
  position: "",
  isStart: false,
  isFinale: false,
  narrationAudio: "",
  driveToNextAudio: "",
  audioStatus: "needs_generation"
};

function stopLabel(stopsById: Map<string, AdminStop>, id: string) {
  return stopsById.get(id)?.name ?? id;
}

function orderedTourStops(tour: Tour | undefined) {
  return [...(tour?.stops ?? [])].sort((a, b) => a.position - b.position).map((membership) => membership.stop);
}

function parseDraftStop(form: StopForm): AdminStop | null {
  if (form.id) {
    return null;
  }

  if (!form.lat.trim() || !form.lng.trim()) {
    return null;
  }

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: "draft-stop",
    slug: "draft-stop",
    name: form.name.trim() || "New stop",
    address: form.address.trim() || null,
    lat,
    lng,
    narrationScript: form.narrationScript,
    safetyWarning: form.safetyWarning,
    themeTags: form.themeTags.split(",").map((tag) => tag.trim()).filter(Boolean),
    status: form.status
  };
}

function buildMapPoints(stops: AdminStop[], boundsStops = stops): MapPoint[] {
  if (stops.length === 0 || boundsStops.length === 0) {
    return [];
  }

  const minLat = Math.min(...boundsStops.map((stop) => stop.lat));
  const maxLat = Math.max(...boundsStops.map((stop) => stop.lat));
  const minLng = Math.min(...boundsStops.map((stop) => stop.lng));
  const maxLng = Math.max(...boundsStops.map((stop) => stop.lng));
  const latSpan = Math.max(0.01, maxLat - minLat);
  const lngSpan = Math.max(0.01, maxLng - minLng);

  return stops.map((stop, index) => {
    const x = 18 + ((stop.lng - minLng) / lngSpan) * 264;
    const y = 142 - ((stop.lat - minLat) / latSpan) * 112;
    return { id: stop.id, label: stop.id === "draft-stop" ? "NEW" : String(index + 1), x, y };
  });
}

function pointString(points: MapPoint[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function AdminRouteMap({
  currentStops,
  proposedStops,
  draftStop,
  title
}: {
  currentStops: AdminStop[];
  proposedStops?: AdminStop[];
  draftStop?: AdminStop | null;
  title: string;
}) {
  const boundsStops = [...currentStops, ...(proposedStops ?? []), ...(draftStop ? [draftStop] : [])];
  const currentPoints = buildMapPoints(currentStops, boundsStops);
  const proposedPoints = proposedStops?.length ? buildMapPoints(proposedStops, boundsStops) : [];
  const draftPoints = draftStop ? buildMapPoints([draftStop], boundsStops) : [];
  const displayPoints = proposedPoints.length ? proposedPoints : currentPoints;

  return (
    <div className="admin-map">
      <div className="admin-section-title">
        <MapIcon aria-hidden="true" />
        {title}
      </div>
      <svg viewBox="0 0 300 160" role="img" aria-label={`${title} map preview`}>
        {currentPoints.length > 1 ? <polyline className="admin-map-current-line" points={pointString(currentPoints)} /> : null}
        {proposedPoints.length > 1 ? <polyline className="admin-map-proposed-line" points={pointString(proposedPoints)} /> : null}
        {displayPoints.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r={point.label === "1" ? 5 : 4} />
            <text x={point.x} y={point.y - 7}>{point.label}</text>
          </g>
        ))}
        {draftPoints.map((point) => (
          <g key={point.id} className="admin-map-draft-point">
            <circle cx={point.x} cy={point.y} r="5.5" />
            <text x={point.x} y={point.y - 8}>{point.label}</text>
          </g>
        ))}
      </svg>
      <div className="admin-map-legend">
        <span><i className="admin-map-key-current" /> Current order</span>
        {proposedPoints.length ? <span><i className="admin-map-key-proposed" /> Suggested order</span> : null}
        {draftStop ? <span><i className="admin-map-key-draft" /> New stop</span> : null}
      </div>
    </div>
  );
}

export function AdminStopsClient({
  initialDashboard,
  adminEmail
}: {
  initialDashboard: Dashboard;
  adminEmail: string;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedTourId, setSelectedTourId] = useState(initialDashboard.tours[0]?.id ?? "");
  const selectedTour = dashboard.tours.find((tour) => tour.id === selectedTourId) ?? dashboard.tours[0];
  const [tourTitle, setTourTitle] = useState(selectedTour?.title ?? "");
  const [tourTarget, setTourTarget] = useState(String(selectedTour?.targetDurationMinutes ?? 70));
  const [stopForm, setStopForm] = useState<StopForm>(emptyStopForm);
  const [membershipForm, setMembershipForm] = useState<MembershipForm>(emptyMembershipForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const stopsById = useMemo(() => {
    const map = new Map<string, AdminStop>();
    for (const stop of dashboard.stops) {
      map.set(stop.id, stop);
    }
    return map;
  }, [dashboard.stops]);
  const latestProposal = dashboard.proposals.find((proposal) => proposal.tourId === selectedTour?.id);
  const currentTourStops = orderedTourStops(selectedTour);
  const proposedStops = latestProposal?.proposedOrder.map((id) => stopsById.get(id)).filter((stop): stop is AdminStop => Boolean(stop));
  const draftStop = parseDraftStop(stopForm);
  const availableStops = dashboard.stops.filter((stop) => !selectedTour?.stops.some((item) => item.stopId === stop.id));

  function chooseTour(tourId: string) {
    const tour = dashboard.tours.find((item) => item.id === tourId);
    setSelectedTourId(tourId);
    setTourTitle(tour?.title ?? "");
    setTourTarget(String(tour?.targetDurationMinutes ?? 70));
    setMembershipForm(emptyMembershipForm);
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
      setMessage(payload.message ?? success);
      if (body.action === "create") {
        setStopForm(emptyStopForm);
      }
      if (body.action === "addStop" || body.action === "updateStop" || body.action === "removeStop") {
        setMembershipForm(emptyMembershipForm);
      }
    });
  }

  function editStop(stop: AdminStop) {
    setStopForm({
      id: stop.id,
      name: stop.name,
      address: stop.address ?? "",
      lat: String(stop.lat),
      lng: String(stop.lng),
      narrationScript: stop.narrationScript,
      safetyWarning: stop.safetyWarning,
      themeTags: stop.themeTags.join(", "),
      status: stop.status
    });
    setMessage(`Editing stop metadata: ${stop.name}`);
    setError("");
  }

  function editMembership(membership: TourStop) {
    editStop(membership.stop);
    setMembershipForm({
      id: membership.id,
      stopId: membership.stopId,
      position: String(membership.position),
      isStart: membership.isStart,
      isFinale: membership.isFinale,
      narrationAudio: membership.narrationAudio ?? "",
      driveToNextAudio: membership.driveToNextAudio ?? "",
      audioStatus: membership.audioStatus
    });
    setMessage(`Editing tour placement: ${membership.stop.name}`);
  }

  function saveStop() {
    requestAdmin(
      "/api/admin/stops",
      {
        action: stopForm.id ? "update" : "create",
        id: stopForm.id,
        name: stopForm.name,
        address: stopForm.address,
        lat: stopForm.lat,
        lng: stopForm.lng,
        narrationScript: stopForm.narrationScript,
        safetyWarning: stopForm.safetyWarning,
        themeTags: stopForm.themeTags,
        status: stopForm.status,
        tourId: stopForm.id ? undefined : selectedTour?.id,
        narrationAudio: membershipForm.narrationAudio,
        driveToNextAudio: membershipForm.driveToNextAudio
      },
      stopForm.id ? "Stop saved. Generate audio if the script changed." : "Stop added to this tour."
    );
  }

  function saveTour() {
    requestAdmin(
      "/api/admin/tours",
      {
        action: "update",
        id: selectedTour?.id,
        title: tourTitle,
        targetDurationMinutes: tourTarget
      },
      "Tour saved."
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">Dark Drives internal</p>
          <h1>Tour management</h1>
          <p>Signed in as {adminEmail}</p>
        </div>
        <button
          className="admin-icon-button"
          type="button"
          title="New stop"
          onClick={() => {
            setStopForm(emptyStopForm);
            setMembershipForm(emptyMembershipForm);
          }}
        >
          <Plus aria-hidden="true" />
        </button>
      </header>

      {message ? <p className="admin-notice">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-panel admin-form">
        <div className="admin-panel-head">
          <div>
            <p className="admin-kicker">Tour</p>
            <h2>{selectedTour?.title ?? "No tour"}</h2>
          </div>
          <select value={selectedTour?.id ?? ""} onChange={(event) => chooseTour(event.target.value)}>
            {dashboard.tours.map((tour) => (
              <option key={tour.id} value={tour.id}>
                {tour.title}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-two">
          <label>
            Tour name
            <input value={tourTitle} onChange={(event) => setTourTitle(event.target.value)} />
          </label>
          <label>
            Target minutes
            <input value={tourTarget} onChange={(event) => setTourTarget(event.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar">
          <button className="admin-action" type="button" disabled={!selectedTour || isPending} onClick={saveTour}>
            <Save aria-hidden="true" />
            Save tour
          </button>
          <button
            className="admin-action"
            type="button"
            disabled={isPending}
            onClick={() =>
              requestAdmin(
                "/api/admin/tours",
                { action: "create", title: "New Tour", targetDurationMinutes: 70 },
                "Tour added."
              )
            }
          >
            <Plus aria-hidden="true" />
            Add tour
          </button>
          <button
            className="admin-action"
            type="button"
            disabled={!selectedTour || isPending}
            onClick={() =>
              requestAdmin(
                "/api/admin/tours",
                { action: "generateAudio", tourId: selectedTour?.id },
                "Audio generation queued for this tour."
              )
            }
          >
            <FileAudio aria-hidden="true" />
            Generate audio
          </button>
          <button
            className="admin-danger"
            type="button"
            disabled={!selectedTour || isPending}
            onClick={() =>
              requestAdmin(
                "/api/admin/tours",
                { action: "delete", id: selectedTour?.id },
                "Tour removed."
              )
            }
          >
            <Trash2 aria-hidden="true" />
            Remove tour
          </button>
        </div>
      </section>

      <section className="admin-grid">
        <div className="admin-panel admin-panel-wide">
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">Tour stops</p>
              <h2>{selectedTour?.stops.length ?? 0} stops</h2>
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

          <AdminRouteMap
            currentStops={currentTourStops}
            proposedStops={latestProposal ? proposedStops : undefined}
            draftStop={draftStop}
            title={latestProposal ? "Current and suggested order" : "Current tour map"}
          />

          <div className="admin-stop-list">
            {selectedTour?.stops.map((membership) => (
              <button key={membership.id} className="admin-stop-row" type="button" onClick={() => editMembership(membership)}>
                <span>{String(membership.position).padStart(2, "0")}</span>
                <strong>{membership.stop.name}</strong>
                <em>{membership.isStart ? "Start" : membership.isFinale ? "Finale" : membership.audioStatus}</em>
              </button>
            ))}
          </div>
        </div>

        <form className="admin-panel admin-form" onSubmit={(event) => event.preventDefault()}>
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">{stopForm.id ? "Edit stop" : "Add stop"}</p>
              <h2>Stop metadata</h2>
            </div>
            <select value={stopForm.status} onChange={(event) => setStopForm((current) => ({ ...current, status: event.target.value as StopStatus }))}>
              <option value="live">Live</option>
              <option value="held">Held</option>
            </select>
          </div>

          <label>
            Name
            <input value={stopForm.name} onChange={(event) => setStopForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Address or vantage point
            <input value={stopForm.address} onChange={(event) => setStopForm((current) => ({ ...current, address: event.target.value }))} />
          </label>
          <div className="admin-two">
            <label>
              Latitude
              <input value={stopForm.lat} onChange={(event) => setStopForm((current) => ({ ...current, lat: event.target.value }))} />
            </label>
            <label>
              Longitude
              <input value={stopForm.lng} onChange={(event) => setStopForm((current) => ({ ...current, lng: event.target.value }))} />
            </label>
          </div>
          <label>
            Theme tags
            <input value={stopForm.themeTags} onChange={(event) => setStopForm((current) => ({ ...current, themeTags: event.target.value }))} />
          </label>
          <label>
            Safety and warning copy
            <textarea value={stopForm.safetyWarning} onChange={(event) => setStopForm((current) => ({ ...current, safetyWarning: event.target.value }))} />
          </label>
          <label>
            Narration script
            <textarea value={stopForm.narrationScript} onChange={(event) => setStopForm((current) => ({ ...current, narrationScript: event.target.value }))} />
          </label>
          <div className="admin-toolbar">
            <button className="admin-action" type="button" disabled={isPending} onClick={saveStop}>
              <Save aria-hidden="true" />
              Save stop
            </button>
            {stopForm.id ? (
              <button
                className="admin-danger"
                type="button"
                disabled={isPending}
                onClick={() =>
                  requestAdmin(
                    "/api/admin/stops",
                    { action: "delete", id: stopForm.id },
                    "Stop removed from the catalog."
                  )
                }
              >
                <Trash2 aria-hidden="true" />
                Remove stop
              </button>
            ) : null}
          </div>
        </form>

        <form className="admin-panel admin-form" onSubmit={(event) => event.preventDefault()}>
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">Tour placement</p>
              <h2>{membershipForm.id ? "Edit order" : "Add existing stop"}</h2>
            </div>
          </div>

          {!membershipForm.id ? (
            <label>
              Stop
              <select value={membershipForm.stopId} onChange={(event) => setMembershipForm((current) => ({ ...current, stopId: event.target.value }))}>
                <option value="">Choose stop</option>
                {availableStops.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stop.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="admin-two">
            <label>
              Position
              <input value={membershipForm.position} onChange={(event) => setMembershipForm((current) => ({ ...current, position: event.target.value }))} />
            </label>
            <label>
              Audio status
              <input value={membershipForm.audioStatus} readOnly />
            </label>
          </div>
          <label>
            Current stop narration audio
            <input value={membershipForm.narrationAudio || "Needs generation"} readOnly />
          </label>
          <label>
            Current drive-leg audio to next stop
            <input value={membershipForm.driveToNextAudio || "Needs generation"} readOnly />
          </label>
          <label className="admin-check-row">
            <input type="checkbox" checked={membershipForm.isStart} onChange={(event) => setMembershipForm((current) => ({ ...current, isStart: event.target.checked }))} />
            <span>Start stop</span>
          </label>
          <label className="admin-check-row">
            <input type="checkbox" checked={membershipForm.isFinale} onChange={(event) => setMembershipForm((current) => ({ ...current, isFinale: event.target.checked }))} />
            <span>Finale stop</span>
          </label>
          <div className="admin-toolbar">
            <button
              className="admin-action"
              type="button"
              disabled={!selectedTour || isPending}
              onClick={() =>
                requestAdmin(
                  "/api/admin/tours",
                  membershipForm.id
                    ? {
                        action: "updateStop",
                        membershipId: membershipForm.id,
                        position: membershipForm.position,
                        isStart: membershipForm.isStart,
                        isFinale: membershipForm.isFinale
                      }
                    : {
                        action: "addStop",
                        tourId: selectedTour?.id,
                        stopId: membershipForm.stopId
                      },
                  membershipForm.id ? "Tour stop saved." : "Stop added to tour."
                )
              }
            >
              <Save aria-hidden="true" />
              Save placement
            </button>
            {membershipForm.id ? (
              <button
                className="admin-danger"
                type="button"
                disabled={isPending}
                onClick={() =>
                  requestAdmin(
                    "/api/admin/tours",
                    { action: "removeStop", membershipId: membershipForm.id },
                    "Stop removed from this tour."
                  )
                }
              >
                <Trash2 aria-hidden="true" />
                Remove from tour
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

              <AdminRouteMap currentStops={currentTourStops} proposedStops={proposedStops} title="Suggested route preview" />

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
            <p className="admin-muted">Create a suggestion to review order, duration, and drive-leg audio that needs regeneration.</p>
          )}
        </section>
      </section>
    </main>
  );
}
