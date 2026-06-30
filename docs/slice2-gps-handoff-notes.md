# Slice 2 GPS and Maps Handoff Notes

Slice 2 keeps the Slice 1 rule: GPS enhances the route, but never gates it.

- Location tracking uses foreground `navigator.geolocation.watchPosition` only while the route is active.
- Position updates are throttled to avoid distance/state churn.
- Denied or unavailable location drops to manual mode where `I'm Here` starts the stop narration.
- The two-ring state machine uses authored `approachRadiusM` and `arriveRadiusM`.
- The effective arm radius scales with speed, bounded around the authored stop radius.
- Hysteresis is simple and intentional: once a stop is armed, GPS jitter cannot downgrade it.
- Ambient volume rises during approach/armed states and returns lower while traveling.
- `Directions` uses `parkPoint` when present, so abandoned/view-from-road stops route to a legal vantage point instead of the story coordinate.
- The route map is a bundled schematic SVG/CSS view, not network map tiles. It continues to render in airplane mode.

Verified locally:

- mocked GPS: traveling -> approaching -> armed
- mocked denied GPS: manual mode -> `I'm Here` -> narration playback
- offline smoke: route assets cached, browser offline, intro and first stop play with zero failed requests
