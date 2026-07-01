import { NextResponse } from "next/server";
import { createOrderProposal, getAdminDashboardData, publishOrderProposal } from "@/lib/server/admin-catalog";
import { requireAdminSession } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { session, response } = await requireAdminSession();
  if (response) {
    return response;
  }

  const body = await request.json();
  const action = String(body.action ?? "create");

  try {
    if (action === "create") {
      const proposal = await createOrderProposal({
        tourId: String(body.tourId ?? ""),
        trigger: String(body.trigger ?? "Manual reorder request"),
        actor: session!.adminEmail
      });

      return NextResponse.json({ ok: true, proposal, dashboard: await getAdminDashboardData() });
    }

    if (action === "publish") {
      await publishOrderProposal({
        proposalId: String(body.proposalId ?? ""),
        actor: session!.adminEmail
      });

      return NextResponse.json({ ok: true, dashboard: await getAdminDashboardData() });
    }

    return NextResponse.json({ error: "Unknown proposal action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
