"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type SessionState = {
  authenticated: boolean;
  email?: string;
  ownsSaskatoon?: boolean;
};

type EntitlementGateProps = {
  children: ReactNode;
  demoEnabled: boolean;
};

export function getInstallDeviceId() {
  const key = "dark-drives-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

export function deviceLabel() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches ? "PWA" : "Browser";
  return `${navigator.platform || "Device"} ${standalone}`;
}

export function EntitlementGate({ children, demoEnabled }: EntitlementGateProps) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoUnlocked, setDemoUnlocked] = useState(demoEnabled);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  if (session === null) {
    return <main className="shell"><div className="phone"><section className="screen"><div className="panel"><h2>Checking access</h2><p>Verifying this device before the route loads.</p></div></section></div></main>;
  }

  if ((session.authenticated && session.ownsSaskatoon) || demoUnlocked) {
    return <>{children}</>;
  }

  async function requestSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const response = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();

    setBusy(false);
    setMessage(data.message ?? data.error ?? "Check your email for a sign-in link.");
  }

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, marketingConsent })
    });
    const data = await response.json();

    setBusy(false);
    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setMessage(data.error ?? "Checkout is not configured in this environment.");
  }

  return (
    <main className="shell">
      <div className="phone">
        <section className="screen" aria-label="Dark Drives access">
          <header className="topbar">
            <div className="brand">
              <span className="kicker">Access Check</span>
              <div className="wordmark" aria-label="Dark Drives">
                Dark Drives<sup>TM</sup>
              </div>
              <h1 className="title">The Dark Side of Saskatoon</h1>
            </div>
            <span className="status-pill">Locked</span>
          </header>

          <div className="hero">
            <span className="stop-count">Server verified</span>
            <h2 className="stop-name">Own the city pack</h2>
            <div className="distance">The checkout redirect never unlocks the tour. Access comes from Stripe&apos;s signed webhook.</div>
          </div>

          <form className="panel" onSubmit={startCheckout}>
            <span className="corner-a" aria-hidden />
            <span className="corner-b" aria-hidden />
            <div className="file-row">
              <span className="file-tab">PACK 01</span>
              <span className="sealed">$19 CAD</span>
            </div>
            <h2>Buy Saskatoon</h2>
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" autoComplete="email" required />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
              <span>Email me Dark Drives news and new city drops.</span>
            </label>
            <button className="primary ready" type="submit" disabled={busy}>Get The Tour</button>
          </form>

          <form className="panel" onSubmit={requestSignIn}>
            <div className="file-row">
              <span className="file-tab">OWNER</span>
              <span className="sealed">MAGIC LINK</span>
            </div>
            <h2>Already bought it?</h2>
            <p>Enter the purchase email. If it owns a pack, a 15-minute sign-in link will restore this device.</p>
            <button className="secondary" type="submit" disabled={busy}>Send Sign-In Link</button>
          </form>

          {demoEnabled && (
            <button className="secondary" onClick={() => setDemoUnlocked(true)}>
              Local Player Smoke Test
            </button>
          )}

          {message && <p className="notice">{message}</p>}
        </section>
      </div>
    </main>
  );
}
