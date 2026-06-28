# Auth, Payment, and Entitlement Notes

This implementation follows the P0 security posture from the auth/payment spec.

- The Stripe success URL is only a "check your email" state. It never grants access.
- `app/api/stripe/webhook/route.ts` is the only code path that creates an entitlement.
- The webhook verifies the Stripe signature and is idempotent by `stripeSessionId`.
- Magic links are random tokens, stored as SHA-256 hashes, single-use, and expire after 15 minutes.
- Device sessions use long-lived random tokens stored in an HTTP-only cookie and hashed in the database.
- The anti-sharing backstop is the 3-device cap, not the magic link. A 4th device gets a device list and can remove one device before activation completes.
- CASL marketing consent is separate from transactional email. The checkout form defaults marketing consent to unchecked.
- Audio cache is disposable. If an entitled session exists but audio is missing, the route player returns to preflight and re-downloads instead of asking the buyer to repurchase.

Required production environment:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
