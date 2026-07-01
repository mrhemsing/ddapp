import { redirect } from "next/navigation";
import { AdminSignInClient } from "@/app/admin/sign-in/AdminSignInClient";
import { getAdminSession } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

export default async function AdminSignInPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/admin/stops");
  }

  return <AdminSignInClient />;
}
