import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchWonAggregate,
  fetchCheckoutDeals,
  fetchProposalDeals,
} from "@/lib/hubspot";
import { aggregate, proposalTimeMatrix, type DashboardData } from "@/lib/aggregate";
import { getSegment, type SegmentConfig } from "@/lib/segments";
import { seedFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Como pode ser alto volume, cacheia por 15 min — por segmento
// (chave inclui config.id) — pra não pagar a busca inteira a cada visita.
const getWonAggregateCached = (config: SegmentConfig) =>
  unstable_cache(() => fetchWonAggregate(config), ["won-aggregate", config.id], { revalidate: 900 })();

// "Tempo até a proposta" é sobre TODO o histórico de propostas enviadas — mesma
// lógica de cache do ticket de ganho (por segmento, 15 min).
const getProposalDealsCached = (config: SegmentConfig) =>
  unstable_cache(() => fetchProposalDeals(config), ["proposal-deals", config.id], { revalidate: 900 })();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));

  if (!process.env.HUBSPOT_TOKEN) {
    // Modo de exemplo: snapshot fixo do segmento, sem filtro de período.
    return NextResponse.json(seedFor(config));
  }

  try {
    const [owners, deals, checkoutDeals, won, proposalDeals] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to }),
      fetchCheckoutDeals(config, { from, to }),
      getWonAggregateCached(config),
      config.hasProposalTime ? getProposalDealsCached(config) : Promise.resolve([]),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      proposalTime: config.hasProposalTime ? proposalTimeMatrix(proposalDeals, owners) : undefined,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
