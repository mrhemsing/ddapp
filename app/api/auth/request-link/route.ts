import { MagicLinkPurpose } from "@prisma/client";
import { NextResponse } from "next/server";
import { createMagicLink, normalizeEmail } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await createMagicLink(email, MagicLinkPurpose.signin, user.id);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email owns a pack, a sign-in link is on the way."
  });
}
