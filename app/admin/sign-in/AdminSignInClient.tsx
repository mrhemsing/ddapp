"use client";

import { FormEvent, useState } from "react";

export function AdminSignInClient() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/admin/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Admin sign-in failed.");
      return;
    }

    setMessage(data.message ?? "Signed in.");
    window.location.href = "/admin/stops";
  }

  return (
    <main className="admin-shell">
      <form className="admin-denied admin-form" onSubmit={signIn}>
        <p className="admin-kicker">Internal</p>
        <h1>Admin sign in</h1>
        <p>Enter the shared admin password.</p>
        <label>
          <span>Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="admin-action" type="submit" disabled={busy}>
          {busy ? "Checking" : "Enter admin"}
        </button>
        {message ? <p className="admin-notice">{message}</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}
      </form>
    </main>
  );
}
