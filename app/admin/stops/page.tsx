import { getAdminPassword, getAdminSession } from "@/lib/server/admin-auth";
import { getAdminDashboardData } from "@/lib/server/admin-catalog";
import { AdminSignInClient } from "@/app/admin/sign-in/AdminSignInClient";
import { AdminStopsClient } from "@/app/admin/stops/AdminStopsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function AdminStopsPage() {
  const session = await getAdminSession();

  if (!session) {
    const passwordReady = Boolean(getAdminPassword());

    return (
      <main className="admin-shell">
        {passwordReady ? (
          <AdminSignInClient
            withShell={false}
            title="Admin access required"
            description="Enter the shared admin password to manage Dark Drives tours."
          />
        ) : (
          <section className="admin-denied">
            <p className="admin-kicker">Internal</p>
            <h1>Admin access required</h1>
            <p>Enter the shared admin password to manage Dark Drives tours.</p>
            <p className="admin-warning">Set DARK_DRIVES_ADMIN_PASSWORD before using this tool.</p>
          </section>
        )}
      </main>
    );
  }

  const dashboard = await getAdminDashboardData();
  const serializableDashboard = JSON.parse(JSON.stringify(dashboard));

  return <AdminStopsClient initialDashboard={serializableDashboard} adminEmail={session.adminEmail} />;
}
