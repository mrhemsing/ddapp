import { NextResponse } from "next/server";
import Stripe from "stripe";
import { PACK_PRICE_CAD, PACK_SLUG, appUrl, requireEnv } from "@/lib/server/env";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    marketingConsent?: boolean;
  };

  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: body.email?.trim() || undefined,
    currency: "cad",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: PACK_PRICE_CAD,
          product_data: {
            name: "Dark Drives: The Dark Side of Saskatoon"
          }
        }
      }
    ],
    consent_collection: {
      promotions: "auto"
    },
    metadata: {
      packSlug: PACK_SLUG,
      marketingConsent: body.marketingConsent ? "true" : "false"
    },
    success_url: `${appUrl()}/purchase/check-email?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/`
  });

  return NextResponse.json({ url: session.url });
}
