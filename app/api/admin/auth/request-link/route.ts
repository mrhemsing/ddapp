import { MagicLinkPurpose } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAdminAllowlist } from "@/lib/server/admin-auth";
import { createMagicLink, normalizeEmail } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (!getAdminAllowlist().includes(email)) {
    return NextResponse.json({ error: "That email is not on the admin allowlist." }, { status: 403 });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email }
  });

  await createMagicLink(email, MagicLinkPurpose.signin, user.id);

  return NextResponse.json({
    ok: true,
    message: "Check your email for the admin sign-in link."
  });
}
