import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchWonAggregate,
  fetchCheckoutDeals,
  fetchClosedCloserDeals,
  fetchFirstCloserMeeting,
} from "@/lib/hubspot";
import { aggregate, closeTimeMatrix, type DashboardData } from "@/lib/aggregate";
import { getSegment, type SegmentConfig } from "@/lib/segments";
import { seedFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A varredura de fechados dos closers + reuniões pode passar de 10s no cache
// frio; a Vercel Hobby permite até 60s. O resultado é cacheado.
export const maxDuration = 60;

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Cacheia por 15 min por segmento pra não pagar a busca a cada visita.
const getWonAggregateCached = (config: SegmentConfig) =>
  unstable_cache(() => fetchWonAggregate(config), ["won-aggregate", config.id], { revalidate: 900 })();

// "Tempo da reunião ao fechamento": negócios FECHADOS dos closers + a 1ª reunião
// concluída de cada um. Negócio fechado é terminal (não muda mais de etapa),
// então dá pra cachear a lista com segurança (30 min). Se a leitura de reuniões
// falhar, guarda o aviso e segue.
const getCloseTimeRawCached = (config: SegmentConfig) =>
  unstable_cache(
    async () => {
      try {
        const closed = await fetchClosedCloserDeals(config);
        const starts = await fetchFirstCloserMeeting(config, closed.map((d) => d.id));
        return { closed, starts: [...starts.entries()], warning: undefined as string | undefined };
      } catch (e) {
        const warning = e instanceof Error ? e.message : "erro ao carregar fechados/reuniões";
        return { closed: [] as Awaited<ReturnType<typeof fetchClosedCloserDeals>>, starts: [] as [string, string][], warning };
      }
    },
    // Dado histórico (fechados) — muda devagar; cacheia 1h. A maioria das
    // visitas pega do cache; só a 1ª após expirar paga o custo da varredura.
    ["close-time-v2", config.id],
    { revalidate: 3600 }
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
    const [owners, deals, checkoutDeals, won, closeRaw] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to }),
      fetchCheckoutDeals(config, { from, to }),
      getWonAggregateCached(config),
      config.hasCloseTime ? getCloseTimeRawCached(config) : Promise.resolve(null),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    const closeTime = closeRaw
      ? closeTimeMatrix(closeRaw.closed, new Map(closeRaw.starts), owners, config.wonStageIds)
      : undefined;

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
        closeTimeWarning: closeRaw?.warning,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      closeTime,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
