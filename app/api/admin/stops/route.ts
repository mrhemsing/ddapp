import { AdminStopStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { createStop, getAdminDashboardData, removeStop, updateStop } from "@/lib/server/admin-catalog";
import { requireAdminSession } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/prisma";

export const runtime = "nodejs";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStatus(value: unknown) {
  return value === AdminStopStatus.live ? AdminStopStatus.live : AdminStopStatus.held;
}

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) {
    return response;
  }

  return NextResponse.json(await getAdminDashboardData());
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminSession();
  if (response) {
    return response;
  }

  const body = await request.json();
  const action = String(body.action ?? "");

  try {
    if (action === "create") {
      const stop = await createStop({
        name: String(body.name ?? ""),
        address: String(body.address ?? ""),
        lat: toNumber(body.lat),
        lng: toNumber(body.lng),
        narrationScript: String(body.narrationScript ?? ""),
        safetyWarning: String(body.safetyWarning ?? ""),
        themeTags: body.themeTags,
        status: toStatus(body.status),
        tourId: body.tourId ? String(body.tourId) : undefined,
        isStart: Boolean(body.isStart),
        isFinale: Boolean(body.isFinale),
        narrationAudio: String(body.narrationAudio ?? ""),
        driveToNextAudio: String(body.driveToNextAudio ?? "")
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "create_stop",
          target: stop.id,
          details: { name: stop.name, status: stop.status }
        }
      });

      return NextResponse.json({ ok: true, stop, dashboard: await getAdminDashboardData() });
    }

    if (action === "update") {
      const stop = await updateStop({
        id: String(body.id ?? ""),
        name: String(body.name ?? ""),
        address: String(body.address ?? ""),
        lat: Number(body.lat),
        lng: Number(body.lng),
        narrationScript: String(body.narrationScript ?? ""),
        safetyWarning: String(body.safetyWarning ?? ""),
        themeTags: body.themeTags,
        status: toStatus(body.status)
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "update_stop",
          target: stop.id,
          details: { name: stop.name, status: stop.status }
        }
      });

      return NextResponse.json({ ok: true, stop, dashboard: await getAdminDashboardData() });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      await removeStop(id);
      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "delete_stop",
          target: id,
          details: {}
        }
      });

      return NextResponse.json({ ok: true, dashboard: await getAdminDashboardData() });
    }

    return NextResponse.json({ error: "Unknown admin stop action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
