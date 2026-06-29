import { NextResponse } from "next/server";
import { fakeRoute } from "@/lib/route-data";
import { getCurrentSession } from "@/lib/server/auth";
import { PACK_SLUG } from "@/lib/server/env";
import type { RoutePack } from "@/lib/route-data";

function loadPrivateRoutePack() {
  const rawJson = process.env.DARK_DRIVES_ROUTE_PACK_JSON;
  const rawBase64 = process.env.DARK_DRIVES_ROUTE_PACK_B64;
  const payload = rawJson ?? (rawBase64 ? Buffer.from(rawBase64, "base64").toString("utf8") : "");

  if (!payload) {
    return null;
  }

  return JSON.parse(payload) as RoutePack;
}

export async function GET() {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json(fakeRoute);
  }

  const session = await getCurrentSession();
  const ownsPack = session?.user.entitlements.some((entitlement) => entitlement.packSlug === PACK_SLUG);

  if (!ownsPack) {
    return NextResponse.json(
      {
        error: "Route pack requires an active Saskatoon entitlement.",
        teaser: {
          id: "saskatoon",
          title: "The Dark Side of Saskatoon",
          stopCount: 40
        }
      },
      { status: 401 }
    );
  }

  const routePack = loadPrivateRoutePack();

  if (!routePack) {
    return NextResponse.json(
      { error: "Production route pack is not configured." },
      { status: 503 }
    );
  }

  return NextResponse.json(routePack);
}
