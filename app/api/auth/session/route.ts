import { NextResponse } from "next/server";
import { PACK_SLUG } from "@/lib/server/env";
import { getCurrentSession } from "@/lib/server/auth";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    email: session.user.email,
    device: {
      id: session.device.id,
      label: session.device.label,
      lastSeenAt: session.device.lastSeenAt
    },
    entitlements: session.user.entitlements.map((entitlement) => ({
      packSlug: entitlement.packSlug,
      grantedAt: entitlement.grantedAt
    })),
    ownsSaskatoon: session.user.entitlements.some((entitlement) => entitlement.packSlug === PACK_SLUG)
  });
}
