import { NextResponse } from "next/server";
import { fetchAllOwners, fetchActiveDeals } from "@/lib/hubspot";
import { aggregate, type DashboardData } from "@/lib/aggregate";
import { SEED_DATA } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.HUBSPOT_TOKEN) {
    return NextResponse.json(SEED_DATA);
  }

  try {
    const [owners, deals] = await Promise.all([fetchAllOwners(), fetchActiveDeals()]);
    const { stages, totals, closers } = aggregate(deals, owners);

    const data: DashboardData = {
      meta: { updatedAt: new Date().toISOString(), usingLiveData: true },
      stages,
      totals,
      closers,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
