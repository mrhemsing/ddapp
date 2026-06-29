# Dark Drives P0 Slice

First slice for the Dark Drives PWA: fake route data, offline audio preflight, Web Audio unlock/ducking, wake lock handling, Google Maps handoff, and a one-button route player.

The intro and first stop use the established mixed Dark Drives narrator samples copied from the sales site repo. Remaining stop audio is generated placeholder WAV until real scripts are ready.

Visual language is lifted from the sales site repo, including the real CSS tokens, font stack, wordmark font, case-file chrome, and green signal-meter motif. Token values live in `lib/theme.ts` and `app/globals.css`.

Auth/payment scaffolding follows the P0 spec:

- Stripe Checkout creates the payment session, but the success redirect never unlocks the app.
- `app/api/stripe/webhook/route.ts` is the only entitlement grant path and verifies Stripe signatures.
- Magic links are random, hashed, single-use, and expire after 15 minutes.
- Device sessions are server-revocable, capped at 3 devices, and the 4th device gets self-serve removal.
- CASL consent is default-unchecked in the app checkout form; transactional activation/sign-in mail always sends.
- Offline audio cache is treated as disposable: entitlement lives server-side, then the player offers the normal route re-download when cache is missing.

Slice 2 GPS/handoff is layered onto the player:

- foreground-only Geolocation watcher while a route is active
- throttled distance updates with two-ring approach/armed states
- speed-aware effective arm radius
- armed-state hysteresis so GPS jitter cannot downgrade the stop
- denied/unavailable location falls back to manual mode
- Google Maps handoff targets `parkPoint` when present for safe legal vantage routing
- offline schematic route map, styled after the sales-site route preview, with no tile dependency

Production route content is loaded through `app/api/route/pack` after entitlement checks. In production, configure exactly one private route payload env var:

- `DARK_DRIVES_ROUTE_PACK_JSON`
- `DARK_DRIVES_ROUTE_PACK_B64`

The public client should fetch the route pack from the API instead of importing coordinate/script data directly.

To build the private payload, place the uncommitted coordinate config at `private/dark-drives-stop-config.json`, then run:

```bash
npm run build:route-pack
```

The script writes `private/dark-drives-route-pack.json`, `private/dark-drives-route-pack.b64`, and `private/dark-drives-route-pack-assets.json`. The `private/` directory is gitignored.

## Run

```bash
npm install
npm run generate:audio
npx prisma generate
npm run dev
```

Open `http://localhost:3002`. This project defaults to port 3002 because the Cloudflare tunnel for shared testing points at `https://soma2.b-average.com/`.

Copy `.env.example` to `.env` and fill the real Postgres, Stripe, and email values before testing checkout/webhooks.

## Smoke Checks

```bash
npm run build
npm audit --omit=dev
```

Manual P0 path:

1. Tap `Prepare Route`.
2. Wait for `Ready offline`.
3. Turn network/airplane mode on.
4. Tap `Begin Drive`.
5. Tap `I'm Here`.
6. Tap `Wake It`.

Expected: intro and stop narration play from cached WAV assets, ambient continues underneath, and the primary button advances to the next stop.
