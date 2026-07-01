import { NextResponse } from "next/server";
import {
  addStopToTour,
  createTour,
  getAdminDashboardData,
  markTourAudioQueued,
  removeStopFromTour,
  removeTour,
  updateTour,
  updateTourStop
} from "@/lib/server/admin-catalog";
import { requireAdminSession } from "@/lib/server/admin-auth";
import { prisma } from "@/lib/server/prisma";

export const runtime = "nodejs";

function toInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
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
      const tour = await createTour({
        title: String(body.title ?? "Untitled Tour"),
        targetDurationMinutes: toInt(body.targetDurationMinutes, 70)
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "create_tour",
          target: tour.id,
          details: { title: tour.title }
        }
      });

      return NextResponse.json({ ok: true, tour, dashboard: await getAdminDashboardData() });
    }

    if (action === "update") {
      const tour = await updateTour({
        id: String(body.id ?? ""),
        title: String(body.title ?? ""),
        targetDurationMinutes: toInt(body.targetDurationMinutes, 70)
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "update_tour",
          target: tour.id,
          details: { title: tour.title, targetDurationMinutes: tour.targetDurationMinutes }
        }
      });

      return NextResponse.json({ ok: true, tour, dashboard: await getAdminDashboardData() });
    }

    if (action === "delete") {
      const id = String(body.id ?? "");
      await removeTour(id);
      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "delete_tour",
          target: id,
          details: {}
        }
      });

      return NextResponse.json({ ok: true, dashboard: await getAdminDashboardData() });
    }

    if (action === "addStop") {
      const membership = await addStopToTour({
        tourId: String(body.tourId ?? ""),
        stopId: String(body.stopId ?? "")
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "add_stop_to_tour",
          target: membership.id,
          details: { tourId: membership.tourId, stopId: membership.stopId }
        }
      });

      return NextResponse.json({ ok: true, membership, dashboard: await getAdminDashboardData() });
    }

    if (action === "updateStop") {
      const membership = await updateTourStop({
        membershipId: String(body.membershipId ?? ""),
        position: toInt(body.position, 1),
        isStart: Boolean(body.isStart),
        isFinale: Boolean(body.isFinale)
      });

      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "update_tour_stop",
          target: membership.id,
          details: { tourId: membership.tourId, stopId: membership.stopId }
        }
      });

      return NextResponse.json({ ok: true, membership, dashboard: await getAdminDashboardData() });
    }

    if (action === "removeStop") {
      const membershipId = String(body.membershipId ?? "");
      await removeStopFromTour(membershipId);
      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "remove_stop_from_tour",
          target: membershipId,
          details: {}
        }
      });

      return NextResponse.json({ ok: true, dashboard: await getAdminDashboardData() });
    }

    if (action === "generateAudio") {
      const tourId = String(body.tourId ?? "");
      await markTourAudioQueued(tourId);
      await prisma.adminAuditLog.create({
        data: {
          actor: session!.adminEmail,
          action: "queue_tour_audio_generation",
          target: tourId,
          details: {}
        }
      });

      return NextResponse.json({
        ok: true,
        dashboard: await getAdminDashboardData(),
        message: "Audio generation queued for this tour."
      });
    }

    return NextResponse.json({ error: "Unknown tour action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
