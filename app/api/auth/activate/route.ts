import { NextResponse } from "next/server";
import { sha256 } from "@/lib/server/crypto";
import { issueDeviceSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    deviceId?: string;
    label?: string;
    removeDeviceId?: string;
  };

  if (!body.token || !body.deviceId) {
    return NextResponse.json({ error: "Missing activation token or device id." }, { status: 400 });
  }

  const magicLink = await prisma.magicLinkToken.findUnique({
    where: { tokenHash: sha256(body.token) },
    include: { user: true }
  });

  if (!magicLink || magicLink.usedAt || magicLink.expiresAt < new Date() || !magicLink.userId) {
    return NextResponse.json({ error: "This link expired. Send a new one." }, { status: 410 });
  }

  const session = await issueDeviceSession({
    userId: magicLink.userId,
    deviceId: body.deviceId,
    label: body.label,
    removeDeviceId: body.removeDeviceId
  });

  if (session.status === "device_cap") {
    return NextResponse.json(
      {
        error: "Device limit reached.",
        devices: session.devices.map((device) => ({
          id: device.id,
          label: device.label,
          lastSeenAt: device.lastSeenAt
        }))
      },
      { status: 409 }
    );
  }

  await prisma.magicLinkToken.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() }
  });

  return NextResponse.json({ ok: true });
}
