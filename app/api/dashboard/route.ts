import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchCheckoutDeals,
  fetchNextOpenTaskByDeal,
} from "@/lib/hubspot";
import { aggregate, taskMatrix, type DashboardData } from "@/lib/aggregate";
import { getSegment, tempStagesOf } from "@/lib/segments";
import { isLeadSourceId, leadSourceValues } from "@/lib/leadSource";
import { seedFor } from "@/lib/seed";
import { getWonAggregateCached, getCloseTimeCached, getMonthGoalCached, getForecastCached } from "@/lib/dashboardCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// NÚCLEO do dashboard: o que aparece no topo e deve pintar rápido — KPIs
// (negócios ativos, forecast, closers, ticket médio), temperatura, tarefas,
// checkout e a Meta do mês. Os cards analíticos pesados (conversão, proposta→
// reunião, motivos, vendas do dia, etc.) vêm num 2º request: /api/dashboard/
// analytics, carregado em paralelo pelo cliente. Assim nenhum request precisa
// encher tudo sozinho — o núcleo volta em poucos segundos e os cards entram
// depois, sem o cliff de cache frio.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));
  const rawOrigem = url.searchParams.get("origem");
  const origemId = isLeadSourceId(rawOrigem) ? rawOrigem : "all";
  const origem = leadSourceValues(origemId);
  const rawOwner = url.searchParams.get("owner");
  const owner = config.team.some((m) => m.ownerId === rawOwner) ? (rawOwner as string) : undefined;

  if (!process.env.HUBSPOT_TOKEN) {
    return NextResponse.json(seedFor(config));
  }

  try {
    // Deals ativos + tarefas deles (que só dependem de `deals`) correm juntos.
    const dealsP = fetchActiveDeals(config, { from, to, origem, owner });
    const tasksP = dealsP.then(async (ds): Promise<{ due: Map<string, number> | null; warning?: string }> => {
      try {
        return { due: await fetchNextOpenTaskByDeal(ds.map((d) => d.id)) };
      } catch (e) {
        return { due: null, warning: e instanceof Error ? e.message : "erro ao carregar tarefas" };
      }
    });

    const [owners, deals, checkoutDeals, won, closeRaw, goalRaw, forecastRaw, tasksRaw] = await Promise.all([
      fetchAllOwners(),
      dealsP,
      fetchCheckoutDeals(config, { from, to, owner }),
      getWonAggregateCached(config, origemId, origem, owner, from, to),
      config.hasCloseTime ? getCloseTimeCached(config, origemId, origem, owner) : Promise.resolve(null),
      config.monthGoal != null ? getMonthGoalCached(config, from, to, owner) : Promise.resolve(null),
      getForecastCached(config, origemId, origem, owner),
      tasksP,
    ]);

    const { stages, tempStages, totals, closers, checkout } = aggregate(deals, owners, won, config, checkoutDeals);

    let tasks: DashboardData["tasks"];
    const taskWarning = tasksRaw.warning;
    if (tasksRaw.due) {
      tasks = taskMatrix(deals, tasksRaw.due, owners, tempStagesOf(config), Date.now());
    }

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
        closeTimeWarning: closeRaw?.warning || goalRaw?.warning,
        taskWarning,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      closeTime: closeRaw?.data,
      tasks,
      monthGoal: goalRaw?.data,
      forecast: forecastRaw?.data,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
