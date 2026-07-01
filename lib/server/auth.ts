import { cookies } from "next/headers";
import { MagicLinkPurpose, type Device, type Entitlement, type User } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { DEVICE_CAP, SESSION_COOKIE, appUrl } from "@/lib/server/env";
import { randomToken, sha256 } from "@/lib/server/crypto";
import { sendMagicLinkEmail } from "@/lib/server/mail";

export type SessionUser = User & {
  entitlements: Entitlement[];
  devices: Device[];
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createMagicLink(emailInput: string, purpose: MagicLinkPurpose, userId?: string) {
  const email = normalizeEmail(emailInput);
  const token = randomToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash,
      purpose,
      expiresAt,
      userId
    }
  });

  const magicUrl = `${appUrl()}/activate?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail({ email, magicUrl, purpose: purpose.toLowerCase() as "activate" | "signin" });
  return magicUrl;
}

export async function issueDeviceSession(input: {
  userId: string;
  deviceId: string;
  label?: string;
  removeDeviceId?: string;
}) {
  const existing = await prisma.device.findUnique({
    where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } }
  });

  if (!existing) {
    const devices = await prisma.device.findMany({
      where: { userId: input.userId },
      orderBy: { lastSeenAt: "asc" }
    });

    if (devices.length >= DEVICE_CAP) {
      if (!input.removeDeviceId) {
        return { status: "device_cap" as const, devices };
      }

      const removable = devices.find((device) => device.id === input.removeDeviceId);
      if (!removable) {
        return { status: "device_cap" as const, devices };
      }

      await prisma.device.delete({ where: { id: removable.id } });
    }
  }

  const sessionToken = randomToken(48);
  const sessionTokenHash = sha256(sessionToken);

  const device = await prisma.device.upsert({
    where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
    update: {
      label: input.label,
      sessionTokenHash,
      lastSeenAt: new Date()
    },
    create: {
      userId: input.userId,
      deviceId: input.deviceId,
      label: input.label,
      sessionTokenHash
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180
  });

  return { status: "ok" as const, device };
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return null;
  }

  const device = await prisma.device.findUnique({
    where: { sessionTokenHash: sha256(sessionToken) },
    include: {
      user: {
        include: {
          entitlements: true,
          devices: { orderBy: { lastSeenAt: "desc" } }
        }
      }
    }
  });

  if (!device) {
    return null;
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() }
  });

  return {
    device,
    user: device.user as SessionUser
  };
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
