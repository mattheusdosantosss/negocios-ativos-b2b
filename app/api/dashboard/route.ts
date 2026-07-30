import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchActiveDeals,
  fetchWonAggregate,
  fetchCheckoutDeals,
  fetchClosedCloserDeals,
  fetchFirstCloserMeeting,
  fetchNextOpenTaskByDeal,
  fetchConversionCounts,
} from "@/lib/hubspot";
import {
  aggregate,
  closeTimeMatrix,
  macroTemaByOwner,
  macroTemaFromByOwner,
  taskMatrix,
  conversionFromCounts,
  type DashboardData,
  type CloseTimeData,
  type MacroTemaByOwner,
  type ConversionData,
} from "@/lib/aggregate";
import { getSegment, tempStagesOf, type SegmentConfig } from "@/lib/segments";
import { isLeadSourceId, leadSourceValues } from "@/lib/leadSource";
import { seedFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A varredura de fechados dos closers + reuniões pode passar de 10s no cache
// frio; a Vercel Hobby permite até 60s. O resultado é cacheado.
export const maxDuration = 60;

// Ticket médio de ganho é sobre TODOS os ganhos (não sofre o filtro de
// período). Cacheia por 15 min por segmento pra não pagar a busca a cada visita.
const getWonAggregateCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    () => fetchWonAggregate(config, { origem, owner }),
    ["won-aggregate", config.id, origemId, owner || "all"],
    { revalidate: 900 }
  )();

// "Tempo da reunião ao fechamento": negócios FECHADOS dos closers + a 1ª reunião
// concluída de cada um. Negócio fechado é terminal (não muda mais de etapa),
// então dá pra cachear a lista com segurança (30 min). Se a leitura de reuniões
// falhar, guarda o aviso e segue.
// Cacheia o RESULTADO COMPUTADO (CloseTimeData ~1MB, só os negócios que entram)
// — NÃO o cru dos 7,4k fechados (~2,7MB, que estoura o limite de 2MB do Data
// Cache da Vercel e não era cacheado, recomputando a cada visita). Owners é
// buscado aqui dentro pra resolver os nomes no popup.
const getCloseTimeCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: CloseTimeData | undefined; warning?: string }> => {
      try {
        const [owners, closed] = await Promise.all([
          fetchAllOwners(),
          fetchClosedCloserDeals(config, origem, owner),
        ]);
        const starts = await fetchFirstCloserMeeting(config, closed.map((d) => d.id));
        return { data: closeTimeMatrix(closed, starts, owners, config.wonStageIds), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar fechados/reuniões" };
      }
    },
    // Dado histórico (fechados) — muda devagar; cacheia 1h. Chave inclui a
    // origem e o closer selecionados. A maioria das visitas pega do cache.
    ["close-time-v3", config.id, origemId, owner || "all"],
    { revalidate: 3600 }
  )();

// "Conversão por macro tema" (B2B): win rate Ganho ÷ fechados por macro_tema,
// sobre os fechados dos closers. Reusa a mesma varredura de fechados (terminais
// → cacheável 1h). Respeita origem e closer selecionados na chave.
const getMacroTemaCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: MacroTemaByOwner | undefined; warning?: string }> => {
      try {
        const closed = await fetchClosedCloserDeals(config, origem, owner);
        // Guarda a contagem POR DONO (mapa pequeno, cacheável) — o recorte de
        // "só closers com pipeline ativo" é aplicado fora do cache, porque
        // depende dos negócios ativos (que variam com período/filtros).
        return { data: macroTemaByOwner(closed, config.wonStageIds), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar macro tema" };
      }
    },
    ["macro-tema-v2", config.id, origemId, owner || "all"],
    { revalidate: 3600 }
  )();

// "Taxa de conversão" (Proposta → Ganho): histórico dos negócios que entraram em
// Proposta, com quebra por mês de criação. Muda devagar; cacheia 1h. O filtro de
// mês é aplicado no cliente (sem refetch). Respeita origem e closer.
const getConversionCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: ConversionData | undefined; warning?: string }> => {
      try {
        // Denominador = negócios criados; Numerador = ganhos. Por data de criação.
        const counts = await fetchConversionCounts(config, { origem, owner });
        return { data: conversionFromCounts(counts), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar conversão" };
      }
    },
    ["conversion-v5", config.id, origemId, owner || "all"],
    { revalidate: 3600 }
  )();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));
  const rawOrigem = url.searchParams.get("origem");
  const origemId = isLeadSourceId(rawOrigem) ? rawOrigem : "all";
  const origem = leadSourceValues(origemId); // [] quando "Todas"
  // Filtro de Closer: só aceita ownerId do roster do segmento (nunca mistura
  // B2B com B2C). Qualquer valor fora do roster vira "todos".
  const rawOwner = url.searchParams.get("owner");
  const owner = config.team.some((m) => m.ownerId === rawOwner) ? (rawOwner as string) : undefined;

  if (!process.env.HUBSPOT_TOKEN) {
    // Modo de exemplo: snapshot fixo do segmento, sem filtro de período.
    return NextResponse.json(seedFor(config));
  }

  try {
    const [owners, deals, checkoutDeals, won, closeRaw, macroRaw, convRaw] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to, origem, owner }),
      fetchCheckoutDeals(config, { from, to }),
      getWonAggregateCached(config, origemId, origem, owner),
      config.hasCloseTime ? getCloseTimeCached(config, origemId, origem, owner) : Promise.resolve(null),
      config.hasMacroTema ? getMacroTemaCached(config, origemId, origem, owner) : Promise.resolve(null),
      getConversionCached(config, origemId, origem, owner),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    const closeTime = closeRaw?.data;
    // "Conversão por macro tema": conta só os closers com pipeline ativo (os que
    // aparecem no painel). Quando um closer específico está selecionado no filtro,
    // mostra ele mesmo (a busca já veio escopada), sem restringir por "ativo".
    const activeOwners = new Set(closers.filter((c) => c.inTeam).map((c) => c.ownerId));
    const macroTema = macroRaw?.data
      ? macroTemaFromByOwner(macroRaw.data, owner ? undefined : activeOwners)
      : undefined;

    // Tarefas por etapa dos negócios ativos (não cacheado — muda toda hora; a
    // leitura de tarefas do escopo ativo é rápida). Se falhar, guarda o aviso.
    let tasks: DashboardData["tasks"];
    let taskWarning: string | undefined;
    try {
      const dueByDeal = await fetchNextOpenTaskByDeal(deals.map((d) => d.id));
      tasks = taskMatrix(deals, dueByDeal, owners, tempStagesOf(config), Date.now());
    } catch (e) {
      taskWarning = e instanceof Error ? e.message : "erro ao carregar tarefas";
    }

    const data: DashboardData = {
      meta: {
        updatedAt: new Date().toISOString(),
        usingLiveData: true,
        segment: config.id,
        label: config.label,
        eyebrow: config.eyebrow,
        pipelineName: config.pipelineName,
        closeTimeWarning: closeRaw?.warning || macroRaw?.warning || convRaw?.warning,
        taskWarning,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      closeTime,
      macroTema,
      tasks,
      conversion: convRaw?.data,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
