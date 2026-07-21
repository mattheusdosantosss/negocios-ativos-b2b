import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchAllOwners, fetchActiveDeals, fetchWonAggregate } from "@/lib/hubspot";
import { aggregate, type DashboardData } from "@/lib/aggregate";
import { SEED_DATA } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Como são ~4k negócios, cacheia por 15 min — histórico muda devagar
// e evita pagar ~6s de busca a cada visita.
const getWonAggregateCached = unstable_cache(
  async () => fetchWonAggregate(),
  ["won-aggregate-all"],
  { revalidate: 900 }
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;

  if (!process.env.HUBSPOT_TOKEN) {
    // Modo de exemplo: snapshot fixo, sem filtro de período.
    return NextResponse.json(SEED_DATA);
  }

  try {
    const [owners, deals, won] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals({ from, to }),
      getWonAggregateCached(),
    ]);
    const { stages, totals, closers } = aggregate(deals, owners, won);

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
