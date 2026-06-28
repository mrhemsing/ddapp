import { NextResponse } from "next/server";
import Stripe from "stripe";
import { MagicLinkPurpose } from "@prisma/client";
import { PACK_SLUG, requireEnv } from "@/lib/server/env";
import { createMagicLink, normalizeEmail } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = normalizeEmail(session.customer_details?.email ?? session.customer_email ?? "");
  if (!email) {
    return NextResponse.json({ error: "Checkout session has no email." }, { status: 400 });
  }

  const packSlug = session.metadata?.packSlug || PACK_SLUG;
  const marketingConsent = session.metadata?.marketingConsent === "true" || session.consent?.promotions === "opt_in";

  const existing = await prisma.entitlement.findUnique({
    where: { stripeSessionId: session.id }
  });

  if (existing) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      marketingConsent: marketingConsent ? true : undefined,
      marketingConsentAt: marketingConsent ? new Date() : undefined
    },
    create: {
      email,
      marketingConsent,
      marketingConsentAt: marketingConsent ? new Date() : undefined
    }
  });

  await prisma.entitlement.upsert({
    where: { userId_packSlug: { userId: user.id, packSlug } },
    update: {
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null
    },
    create: {
      userId: user.id,
      packSlug,
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null
    }
  });

  await createMagicLink(email, MagicLinkPurpose.activate, user.id);

  return NextResponse.json({ received: true });
}
