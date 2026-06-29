import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { fakeRoute } from "@/lib/route-data";
import { getCurrentSession } from "@/lib/server/auth";
import { PACK_SLUG } from "@/lib/server/env";
import type { RoutePack } from "@/lib/route-data";

export const runtime = "nodejs";

const localRoutePackPath = path.join(process.cwd(), "private", "dark-drives-route-pack.json");

async function loadLocalRoutePack() {
  try {
    const payload = await readFile(localRoutePackPath, "utf8");
    return JSON.parse(payload) as RoutePack;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function loadPrivateRoutePack() {
  const rawJson = process.env.DARK_DRIVES_ROUTE_PACK_JSON;
  const rawBase64 = process.env.DARK_DRIVES_ROUTE_PACK_B64;
  const payload = rawJson ?? (rawBase64 ? Buffer.from(rawBase64, "base64").toString("utf8") : "");

  if (payload) {
    return JSON.parse(payload) as RoutePack;
  }

  return loadLocalRoutePack();
}

export async function GET() {
  if (process.env.NODE_ENV !== "production") {
    const routePack = await loadPrivateRoutePack();
    return NextResponse.json(routePack ?? fakeRoute);
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

  const routePack = await loadPrivateRoutePack();

  if (routePack) {
    return NextResponse.json(routePack);
  }

  return NextResponse.json(
    { error: "Production route pack is not configured." },
    { status: 503 }
  );
}
