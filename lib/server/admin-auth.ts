import { NextResponse } from "next/server";
import { getCurrentSession, normalizeEmail } from "@/lib/server/auth";

export type AdminSession = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>> & {
  adminEmail: string;
};

export function getAdminAllowlist() {
  return (process.env.DARK_DRIVES_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await getCurrentSession();
  if (!session) {
    return null;
  }

  const adminEmail = normalizeEmail(session.user.email);
  const allowlist = getAdminAllowlist();
  if (!allowlist.includes(adminEmail)) {
    return null;
  }

  return { ...session, adminEmail };
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 })
    };
  }

  return { session, response: null };
}
