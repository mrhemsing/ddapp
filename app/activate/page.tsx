"use client";

import { useEffect, useState } from "react";
import { deviceLabel, getInstallDeviceId } from "@/components/EntitlementGate";

type DeviceChoice = {
  id: string;
  label: string | null;
  lastSeenAt: string;
};

export default function ActivatePage() {
  const [status, setStatus] = useState("Checking your link.");
  const [token, setToken] = useState("");
  const [devices, setDevices] = useState<DeviceChoice[]>([]);

  useEffect(() => {
    const nextToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(nextToken);
    if (!nextToken) {
      setStatus("This activation link is missing its token.");
      return;
    }

    void activate(nextToken);
  }, []);

  async function activate(linkToken = token, removeDeviceId?: string) {
    setStatus("Registering this device.");
    const response = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: linkToken,
        deviceId: getInstallDeviceId(),
        label: deviceLabel(),
        removeDeviceId
      })
    });
    const data = await response.json();

    if (response.status === 409) {
      setDevices(data.devices ?? []);
      setStatus("Three devices are already active. Remove one to continue.");
      return;
    }

    if (!response.ok) {
      setStatus(data.error ?? "This link could not be used.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="shell">
      <div className="phone">
        <section className="screen">
          <header className="topbar">
            <div className="brand">
              <span className="kicker">Activation</span>
              <div className="wordmark">Dark Drives<sup>TM</sup></div>
              <h1 className="title">Device access</h1>
            </div>
            <span className="status-pill">Secure</span>
          </header>

          <div className="panel">
            <span className="corner-a" aria-hidden />
            <span className="corner-b" aria-hidden />
            <div className="file-row">
              <span className="file-tab">DEVICE</span>
              <span className="sealed">CAP 3</span>
            </div>
            <h2>{status}</h2>
            {devices.length > 0 && (
              <div className="device-list">
                {devices.map((device) => (
                  <button className="secondary" key={device.id} onClick={() => activate(token, device.id)}>
                    Remove {device.label ?? "old device"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
