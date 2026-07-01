import Link from "next/link";
import { getAdminSession } from "@/lib/server/admin-auth";
import { getAdminAllowlist } from "@/lib/server/admin-auth";
import { getAdminDashboardData } from "@/lib/server/admin-catalog";
import { AdminStopsClient } from "@/app/admin/stops/AdminStopsClient";

export const runtime = "nodejs";

export default async function AdminStopsPage() {
  const session = await getAdminSession();

  if (!session) {
    const allowlistReady = getAdminAllowlist().length > 0;

    return (
      <main className="admin-shell">
        <section className="admin-denied">
          <p className="admin-kicker">Internal</p>
          <h1>Admin access required</h1>
          <p>
            This stop dashboard is private and restricted to the configured Dark Drives operators.
          </p>
          {!allowlistReady ? (
            <p className="admin-warning">Set DARK_DRIVES_ADMIN_EMAILS before using this tool.</p>
          ) : null}
          <Link className="admin-link" href="/admin/sign-in">
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  const dashboard = await getAdminDashboardData();
  const serializableDashboard = JSON.parse(JSON.stringify(dashboard));

  return <AdminStopsClient initialDashboard={serializableDashboard} adminEmail={session.adminEmail} />;
}
