import { NextRequest, NextResponse } from "next/server";
import { fetchAllOwners, fetchActiveDeals } from "@/lib/hubspot";
import { aggregate, type DashboardData } from "@/lib/aggregate";
import { SEED_DATA } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;

  if (!process.env.HUBSPOT_TOKEN) {
    // Modo de exemplo: snapshot fixo, sem filtro de período.
    return NextResponse.json(SEED_DATA);
  }

  try {
    const [owners, deals] = await Promise.all([fetchAllOwners(), fetchActiveDeals({ from, to })]);
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
