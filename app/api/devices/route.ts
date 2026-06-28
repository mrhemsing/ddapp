import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    devices: session.user.devices.map((device) => ({
      id: device.id,
      label: device.label,
      lastSeenAt: device.lastSeenAt
    }))
  });
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
  if (!body.deviceId) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  await prisma.device.deleteMany({
    where: {
      id: body.deviceId,
      userId: session.user.id
    }
  });

  return NextResponse.json({ ok: true });
}
