import { NextResponse } from "next/server";
import { getAdminPassword, issueAdminSession } from "@/lib/server/admin-auth";
import { safeEqual } from "@/lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const configuredPassword = getAdminPassword();

  if (!configuredPassword) {
    return NextResponse.json({ error: "Admin password is not configured." }, { status: 500 });
  }

  if (!body.password || !safeEqual(body.password, configuredPassword)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 403 });
  }

  await issueAdminSession();

  return NextResponse.json({ ok: true, message: "Signed in." });
}
