import Link from "next/link";
import { getAdminPassword, getAdminSession } from "@/lib/server/admin-auth";
import { getAdminDashboardData } from "@/lib/server/admin-catalog";
import { AdminStopsClient } from "@/app/admin/stops/AdminStopsClient";

export const runtime = "nodejs";

export default async function AdminStopsPage() {
  const session = await getAdminSession();

  if (!session) {
    const passwordReady = Boolean(getAdminPassword());

    return (
      <main className="admin-shell">
        <section className="admin-denied">
          <p className="admin-kicker">Internal</p>
          <h1>Admin access required</h1>
          <p>Enter the shared admin password to manage Dark Drives tours.</p>
          {!passwordReady ? (
            <p className="admin-warning">Set DARK_DRIVES_ADMIN_PASSWORD before using this tool.</p>
          ) : null}
          <Link className="admin-link" href="/admin/sign-in">
            Enter password
          </Link>
        </section>
      </main>
    );
  }

  const dashboard = await getAdminDashboardData();
  const serializableDashboard = JSON.parse(JSON.stringify(dashboard));

  return <AdminStopsClient initialDashboard={serializableDashboard} adminEmail={session.adminEmail} />;
}
