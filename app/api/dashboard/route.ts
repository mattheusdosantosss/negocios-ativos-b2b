import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchWonAggregate,
  fetchCheckoutDeals,
  fetchOpenDeals,
  fetchFirstCloserMeeting,
  debugMeetings,
} from "@/lib/hubspot";
import { aggregate, meetingTimeMatrix, type DashboardData } from "@/lib/aggregate";
import { getSegment, type SegmentConfig } from "@/lib/segments";
import { seedFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Como pode ser alto volume, cacheia por 15 min — por segmento
// (chave inclui config.id) — pra não pagar a busca inteira a cada visita.
const getWonAggregateCached = (config: SegmentConfig) =>
  unstable_cache(() => fetchWonAggregate(config), ["won-aggregate", config.id], { revalidate: 900 })();

// "Tempo até a proposta": negócios em aberto + a 1ª reunião com closer de cada
// um. Varredura pesada (associações + reuniões) → cacheia por segmento (15 min).
// Se a leitura de reuniões falhar (ex.: escopo), guarda o aviso e segue.
const getMeetingRawCached = (config: SegmentConfig) =>
  unstable_cache(
    async () => {
      const openDeals = await fetchOpenDeals(config);
      try {
        const starts = await fetchFirstCloserMeeting(config, openDeals.map((d) => d.id));
        return { openDeals, starts: [...starts.entries()], warning: undefined as string | undefined };
      } catch (e) {
        const warning = e instanceof Error ? e.message : "erro ao ler reuniões";
        return { openDeals, starts: [] as [string, string][], warning };
      }
    },
    ["meeting-raw", config.id],
    { revalidate: 900 }
  )();

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
    // Diagnóstico temporário: /api/dashboard?segment=b2c&debug=meetings
    if (url.searchParams.get("debug") === "meetings" && config.hasMeetingTime) {
      const openDeals = await fetchOpenDeals(config);
      const dbg = await debugMeetings(config, openDeals.map((d) => d.id));
      return NextResponse.json({ openDeals: openDeals.length, ...dbg });
    }

    const [owners, deals, checkoutDeals, won, meetingRaw] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to }),
      fetchCheckoutDeals(config, { from, to }),
      getWonAggregateCached(config),
      config.hasMeetingTime ? getMeetingRawCached(config) : Promise.resolve(null),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    const meetingTime = meetingRaw
      ? meetingTimeMatrix(meetingRaw.openDeals, new Map(meetingRaw.starts), owners)
      : undefined;

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
        meetingWarning: meetingRaw?.warning,
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
