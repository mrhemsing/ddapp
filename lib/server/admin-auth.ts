import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { safeEqual, sha256 } from "@/lib/server/crypto";

const ADMIN_COOKIE = "dd_admin";

export type AdminSession = {
  adminEmail: string;
};

export function getAdminPassword() {
  return process.env.DARK_DRIVES_ADMIN_PASSWORD?.trim() ?? "";
}

function adminCookieValue(password = getAdminPassword()) {
  return sha256(`dark-drives-admin:${password}`);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }

  const cookieStore = await cookies();
  const adminCookie = cookieStore.get(ADMIN_COOKIE)?.value ?? "";
  if (!adminCookie || !safeEqual(adminCookie, adminCookieValue(password))) {
    return null;
  }

  return { adminEmail: "password-admin" };
}

export async function issueAdminSession() {
  const password = getAdminPassword();
  if (!password) {
    throw new Error("DARK_DRIVES_ADMIN_PASSWORD is not configured.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, adminCookieValue(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
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
