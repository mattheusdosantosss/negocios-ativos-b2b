import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchWonAggregate,
  fetchCheckoutDeals,
  fetchMeetingScopeDeals,
  fetchFirstCloserMeeting,
} from "@/lib/hubspot";
import { aggregate, meetingTimeMatrix, type DashboardData } from "@/lib/aggregate";
import { getSegment, type SegmentConfig } from "@/lib/segments";
import { seedFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A varredura de reuniões (associações + meetings) pode passar de 10s no cache
// frio; a Vercel Hobby permite até 60s. O resultado é cacheado 15 min.
export const maxDuration = 60;

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Como pode ser alto volume, cacheia por 15 min — por segmento
// (chave inclui config.id) — pra não pagar a busca inteira a cada visita.
const getWonAggregateCached = (config: SegmentConfig) =>
  unstable_cache(() => fetchWonAggregate(config), ["won-aggregate", config.id], { revalidate: 900 })();


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
    const [owners, deals, checkoutDeals, won, meetingScope] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to }),
      fetchCheckoutDeals(config, { from, to }),
      getWonAggregateCached(config),
      // escopo FRESCO (não cacheado): negócio que muda de etapa — ex.: vira
      // Perdido — sai da métrica na hora, sem janela de cache velho.
      config.hasMeetingTime ? fetchMeetingScopeDeals(config) : Promise.resolve([]),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    let meetingTime;
    let meetingWarning: string | undefined;
    if (config.hasMeetingTime) {
      try {
        const starts = await fetchFirstCloserMeeting(config, meetingScope.map((d) => d.id));
        meetingTime = meetingTimeMatrix(meetingScope, starts, owners);
      } catch (e) {
        meetingWarning = e instanceof Error ? e.message : "erro ao ler reuniões";
        meetingTime = meetingTimeMatrix(meetingScope, new Map(), owners);
      }
    }

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
        meetingWarning,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      meetingTime,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
