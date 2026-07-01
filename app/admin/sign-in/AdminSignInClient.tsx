"use client";

import { FormEvent, useState } from "react";

export function AdminSignInClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [magicUrl, setMagicUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    setMagicUrl("");

    const response = await fetch("/api/admin/auth/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Admin sign-in failed.");
      return;
    }

    setMessage(data.message ?? "Check your email for the admin sign-in link.");
    setMagicUrl(data.magicUrl ?? "");
  }

  return (
    <main className="admin-shell">
      <form className="admin-denied admin-form" onSubmit={requestLink}>
        <p className="admin-kicker">Internal</p>
        <h1>Admin sign in</h1>
        <p>Enter an allowed operator email. We will send a 15-minute sign-in link.</p>
        <label>
          <span>Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            inputMode="email"
            autoComplete="email"
            required
          />
        </label>
        <button className="admin-action" type="submit" disabled={busy}>
          {busy ? "Sending" : "Send sign-in link"}
        </button>
        {message ? <p className="admin-notice">{message}</p> : null}
        {magicUrl ? (
          <a className="admin-action admin-link-action" href={magicUrl}>
            Open sign-in link
          </a>
        ) : null}
        {error ? <p className="admin-error">{error}</p> : null}
      </form>
    </main>
  );
}
