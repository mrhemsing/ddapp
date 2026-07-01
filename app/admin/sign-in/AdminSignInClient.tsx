"use client";

import { FormEvent, useEffect, useState } from "react";

type AdminSignInClientProps = {
  withShell?: boolean;
  title?: string;
  description?: string;
};

export function AdminSignInClient({
  withShell = true,
  title = "Admin sign in",
  description = "Enter the shared admin password."
}: AdminSignInClientProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
  }, []);

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

  const form = (
    <form className="admin-denied admin-form" onSubmit={signIn}>
      <p className="admin-kicker">Internal</p>
      <h1>{title}</h1>
      <p>{description}</p>
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
  );

  return withShell ? <main className="admin-shell">{form}</main> : form;
}
