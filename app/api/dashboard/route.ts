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
  fetchPropostaMeetingStats,
  fetchLostReasons,
  fetchReunioesPerfil,
  fetchTempoQualifProposta,
  fetchSalesByCloser,
} from "@/lib/hubspot";
import { fetchGanhosAtributos, fetchLeadTimeGanhos } from "@/lib/b2cCards";
import { fetchVendasDoDia } from "@/lib/vendasDia";
import {
  aggregate,
  closeTimeMatrix,
  taskMatrix,
  conversionFromCounts,
  type DashboardData,
  type CloseTimeData,
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
    // Agregado histórico (ticket médio de todos os ganhos) — quase não muda;
    // cacheia 6h pra reduzir a frequência de recomputo caro.
    { revalidate: 21600 }
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
          // Janela de 12 meses: o tempo-até-fechamento recente é representativo e
          // evita varrer todo o histórico (dezenas de milhares no B2C).
          fetchClosedCloserDeals(config, origem, owner, 6),
        ]);
        const starts = await fetchFirstCloserMeeting(config, closed.map((d) => d.id));
        return { data: closeTimeMatrix(closed, starts, owners, config.wonStageIds), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar fechados/reuniões" };
      }
    },
    // Dado histórico (fechados) — muda devagar; cacheia 1h. Chave inclui a
    // origem e o closer selecionados. A maioria das visitas pega do cache.
    ["close-time-v5", config.id, origemId, owner || "all"],
    { revalidate: 21600 }
  )();

// "Taxa de conversão" (Proposta → Ganho): histórico dos negócios que entraram em
// Proposta, com quebra por mês de criação. Muda devagar; cacheia 1h. O filtro de
// mês é aplicado no cliente (sem refetch). Respeita origem e closer.
const getConversionCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    // SEM try/catch interno de propósito: se o fetch falhar (ex.: 429), a
    // exceção propaga e o unstable_cache NÃO cacheia — o próximo request
    // recomputa em vez de ficar 6h com a conversão vazia. O .catch fica no
    // chamador (Promise.all), pra não derrubar o painel.
    async (): Promise<{ data: ConversionData | undefined; warning?: string }> => {
      // Denominador = negócios com proposta anexada (B2B) ou criados (B2C);
      // Numerador = ganhos. Recortado por data de criação.
      const counts = await fetchConversionCounts(config, { origem, owner });
      const monthFilterLabel = config.conversionDateProp === "closedate" ? "Mês de fechamento" : "Mês de criação";
      return { data: conversionFromCounts(counts, config.conversionDenomLabel, monthFilterLabel), warning: undefined };
    },
    ["conversion-v18-janela1615", config.id, origemId, owner || "all"],
    { revalidate: 21600 }
  )();

// "Proposta enviada → reunião" (B2B): dos negócios com proposta anexada, quantos
// tiveram reunião. Via associação negócio→reunião (pesado) → cacheia 1h.
const getPropostaMeetingCached = (
  config: SegmentConfig,
  origemId: string,
  origem: string[],
  owner: string | undefined,
  from: string | undefined,
  to: string | undefined
) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["propostaMeeting"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchPropostaMeetingStats(config, { origem, owner, from, to }, owners), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar proposta→reunião" };
      }
    },
    ["proposta-meeting-v5", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 21600 }
  )();

// "Motivos de perda" (B2C): distribuição de closed_lost_reason dos perdidos
// (últimos ~18 meses). Muda devagar; cacheia 1h. Respeita origem/closer.
const getLostReasonsCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["motivos"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchLostReasons(config, { origem, owner }, owners), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar motivos de perda" };
      }
    },
    ["lost-reasons-v12", config.id, origemId, owner || "all"],
    { revalidate: 3600 }
  )();

// "Reuniões por perfil" (B2C): agendada/realizada/cancelada/no-show por perfil
// do negócio. Segue o período (por data da reunião) → chave inclui from/to.
// Muda com novas reuniões; cacheia 1h.
const getReunioesPerfilCached = (
  config: SegmentConfig,
  origemId: string,
  origem: string[],
  owner: string | undefined,
  from: string | undefined,
  to: string | undefined
) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["reunioesPerfil"]; warning?: string }> => {
      try {
        return { data: await fetchReunioesPerfil(config, { from, to, owner, origem }), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar reuniões por perfil" };
      }
    },
    ["reunioes-perfil-v7", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 3600 }
  )();

// "Tempo até proposta" (B2B): dias da qualificação até a 1ª entrada em Proposta.
// Segue o período (cohort de propostas do período) → chave inclui from/to.
const getTempoPropostaCached = (
  config: SegmentConfig,
  origemId: string,
  origem: string[],
  owner: string | undefined,
  from: string | undefined,
  to: string | undefined
) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["tempoProposta"]; warning?: string }> => {
      try {
        return { data: await fetchTempoQualifProposta(config, { from, to, owner, origem }), warning: undefined };
      } catch (e) {
        console.error("[tempo-proposta]", e instanceof Error ? e.stack || e.message : e);
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar tempo até proposta" };
      }
    },
    ["tempo-proposta-v7", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 3600 }
  )();

// Cards B2C 7/8/9 — cacheados por segmento + filtros. Nome do closer vem do
// roster (config.team). Não-fatais (falha vira warning, não derruba o painel).
const nomeMap = (config: SegmentConfig) => new Map(config.team.map((m) => [m.ownerId, m.nome]));

const getGanhosAtributosCached = (config: SegmentConfig, origemId: string, origem: string[], owner: string | undefined, from?: string, to?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["ganhosAtributos"]; warning?: string }> => {
      try {
        return { data: await fetchGanhosAtributos(config, { from, to, owner, origem }, nomeMap(config)) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar ganhos por atributo" };
      }
    },
    ["ganhos-atributos-v1", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 3600 }
  )();

const getLeadTimeGanhosCached = (config: SegmentConfig, origemId: string, origem: string[], owner: string | undefined, from?: string, to?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["leadTimeGanhos"]; warning?: string }> => {
      try {
        return { data: await fetchLeadTimeGanhos(config, { from, to, owner, origem }, nomeMap(config)) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar lead time dos ganhos" };
      }
    },
    ["lead-time-ganhos-v1", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 3600 }
  )();

// "Vendas do Dia": ganhos do SEGMENTO agrupados por dia (pela entrada na etapa
// de ganho); vendas que caíram ficam sinalizadas. Chave por segmento + período.
const getVendasDoDiaCached = (config: SegmentConfig, from?: string, to?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["vendasDoDia"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchVendasDoDia(config, { from, to }, owners) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar vendas do dia" };
      }
    },
    ["vendas-dia-v9", config.id, from || "cur", to || "cur"],
    { revalidate: 600 }
  )();

// "Meta do mês": vendas GANHAS da pipeline por data de fechamento no período
// (sem período → mês corrente) vs a meta mensal fixa. Segue o filtro de Closer
// (um closer → só as vendas dele). Cacheia 10 min por segmento + datas + closer.
const getMonthGoalCached = (config: SegmentConfig, from?: string, to?: string, owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["monthGoal"]; warning?: string }> => {
      try {
        if (config.monthGoal == null) return { data: undefined };
        const owners = await fetchAllOwners();
        const sales = await fetchSalesByCloser(config, { from, to, owner }, owners);
        return { data: { goal: config.monthGoal, ...sales }, warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar meta do mês" };
      }
    },
    ["month-goal-v7-margem", config.id, from || "cur", to || "cur", owner || "all"],
    { revalidate: 600 }
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
    const [owners, deals, checkoutDeals, won, closeRaw, vendasDiaRaw, convRaw, propMeetRaw, motivosRaw, goalRaw, reunioesPerfilRaw, tempoPropRaw, ganhosAtribRaw, leadTimeRaw] = await Promise.all([
      fetchAllOwners(),
      fetchActiveDeals(config, { from, to, origem, owner }),
      fetchCheckoutDeals(config, { from, to, owner }),
      getWonAggregateCached(config, origemId, origem, owner),
      config.hasCloseTime ? getCloseTimeCached(config, origemId, origem, owner) : Promise.resolve(null),
      getVendasDoDiaCached(config, from, to),
      getConversionCached(config, origemId, origem, owner).catch(
        (e): { data: ConversionData | undefined; warning?: string } => ({ data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar conversão" })
      ),
      config.hasPropostaMeeting ? getPropostaMeetingCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasLostReasons ? getLostReasonsCached(config, origemId, origem, owner) : Promise.resolve(null),
      config.monthGoal != null ? getMonthGoalCached(config, from, to, owner) : Promise.resolve(null),
      config.hasReunioesPerfil ? getReunioesPerfilCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasTempoProposta ? getTempoPropostaCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasGanhoCards ? getGanhosAtributosCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasGanhoCards ? getLeadTimeGanhosCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
    ]);
    const { stages, tempStages, totals, closers, checkout } = aggregate(
      deals,
      owners,
      won,
      config,
      checkoutDeals
    );

    const closeTime = closeRaw?.data;

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
        closeTimeWarning: closeRaw?.warning || vendasDiaRaw?.warning || convRaw?.warning || goalRaw?.warning,
        taskWarning,
      },
      stages,
      tempStages,
      totals,
      closers,
      checkout,
      closeTime,
      vendasDoDia: vendasDiaRaw?.data,
      tasks,
      conversion: convRaw?.data,
      propostaMeeting: propMeetRaw?.data,
      motivos: motivosRaw?.data,
      reunioesPerfil: reunioesPerfilRaw?.data,
      tempoProposta: tempoPropRaw?.data,
      ganhosAtributos: ganhosAtribRaw?.data,
      leadTimeGanhos: leadTimeRaw?.data,
      monthGoal: goalRaw?.data,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
