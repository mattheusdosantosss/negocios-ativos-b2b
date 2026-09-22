// Getters cacheados dos cards do dashboard — extraídos da rota pra serem
// compartilhados entre /api/dashboard (núcleo) e /api/dashboard/analytics
// (cards pesados carregados em 2ª fase). NENHUMA lógica muda aqui: é o mesmo
// unstable_cache com as mesmas chaves de antes.
import { unstable_cache } from "next/cache";
import {
  fetchAllOwners,
  fetchWonAggregate,
  fetchForecastDeals,
  fetchClosedCloserDeals,
  fetchFirstCloserMeeting,
  fetchConversionCounts,
  fetchPropostaMeetingStats,
  fetchLostReasons,
  fetchReunioesPerfil,
  fetchTempoQualifProposta,
  fetchSalesByCloser,
} from "@/lib/hubspot";
import { fetchGanhosAtributos, fetchLeadTimeGanhos } from "@/lib/b2cCards";
import { fetchVendasDoDia } from "@/lib/vendasDia";
import { fetchPropostaMesmoDia } from "@/lib/propostaMesmoDia";
import {
  closeTimeMatrix,
  conversionFromCounts,
  forecastItems,
  type DashboardData,
  type CloseTimeData,
  type ConversionData,
} from "@/lib/aggregate";
import { type SegmentConfig } from "@/lib/segments";

// Ticket médio de ganho — segue o filtro de tempo (por data de fechamento).
// Sem from/to = todo o histórico. Cacheia 10min (mês corrente muda ao longo do dia).
export const getWonAggregateCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string, from?: string, to?: string) =>
  unstable_cache(
    () => fetchWonAggregate(config, { origem, owner, from, to }),
    ["won-aggregate-v2-periodo", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 600 }
  )();

// "Valor previsto (Forecast)" — SEMPRE todo o período (ignora o filtro de data
// de criação da header); respeita origem/closer. Cacheia 10min.
export const getForecastCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["forecast"]; warning?: string }> => {
      try {
        const [owners, deals] = await Promise.all([fetchAllOwners(), fetchForecastDeals(config, { origem, owner })]);
        return { data: forecastItems(deals, owners) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar forecast" };
      }
    },
    ["forecast-v1", config.id, origemId, owner || "all"],
    { revalidate: 600 }
  )();

// "Tempo da reunião ao fechamento": fechados dos closers + 1ª reunião concluída.
// Cacheia o RESULTADO COMPUTADO (CloseTimeData). Owners buscado aqui dentro.
export const getCloseTimeCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: CloseTimeData | undefined; warning?: string }> => {
      try {
        const [owners, closed] = await Promise.all([
          fetchAllOwners(),
          fetchClosedCloserDeals(config, origem, owner, 6),
        ]);
        const starts = await fetchFirstCloserMeeting(config, closed.map((d) => d.id));
        return { data: closeTimeMatrix(closed, starts, owners, config.wonStageIds), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar fechados/reuniões" };
      }
    },
    ["close-time-v5", config.id, origemId, owner || "all"],
    { revalidate: 21600 }
  )();

// "Taxa de conversão" (Proposta → Ganho). SEM try/catch interno de propósito: se
// o fetch falhar (ex.: 429), a exceção propaga e o unstable_cache NÃO cacheia.
export const getConversionCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: ConversionData | undefined; warning?: string }> => {
      const counts = await fetchConversionCounts(config, { origem, owner });
      const monthFilterLabel = config.conversionDateProp === "closedate" ? "Mês de fechamento" : "Mês de criação";
      return { data: conversionFromCounts(counts, config.conversionDenomLabel, monthFilterLabel), warning: undefined };
    },
    ["conversion-v18-janela1615", config.id, origemId, owner || "all"],
    { revalidate: 21600 }
  )();

// "Proposta enviada → reunião" (B2B).
export const getPropostaMeetingCached = (
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

// "Motivos de perda".
export const getLostReasonsCached = (config: SegmentConfig, origemId: string, origem: string[], owner?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["motivos"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchLostReasons(config, { origem, owner }, owners), warning: undefined };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar motivos de perda" };
      }
    },
    ["lost-reasons-v14-mescalendario", config.id, origemId, owner || "all"],
    { revalidate: 3600 }
  )();

// "Reuniões por perfil" (B2C).
export const getReunioesPerfilCached = (
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
    ["reunioes-perfil-v8-tipos5", config.id, origemId, owner || "all", from || "all", to || "all"],
    { revalidate: 3600 }
  )();

// "Tempo até proposta" (B2B).
export const getTempoPropostaCached = (
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

// Cards B2C 7/8 — nome do closer vem do roster (config.team).
const nomeMap = (config: SegmentConfig) => new Map(config.team.map((m) => [m.ownerId, m.nome]));

export const getGanhosAtributosCached = (config: SegmentConfig, origemId: string, origem: string[], owner: string | undefined, from?: string, to?: string) =>
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

export const getLeadTimeGanhosCached = (config: SegmentConfig, origemId: string, origem: string[], owner: string | undefined, from?: string, to?: string) =>
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

// "Proposta no mesmo dia" (B2B): por closer, propostas enviadas no mesmo dia da
// qualificação (sem reunião) / da reunião (com reunião). Segue o filtro de tempo.
export const getPropostaMesmoDiaCached = (config: SegmentConfig, origemId: string, owner: string | undefined, from?: string, to?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["propostaMesmoDia"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchPropostaMesmoDia(config, { from, to, owner }, owners, nomeMap(config)) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar proposta no mesmo dia" };
      }
    },
    ["proposta-mesmo-dia-v12-emdiacom", config.id, origemId, owner || "all", from || "cur", to || "cur"],
    { revalidate: 600 }
  )();

// "Vendas do Dia": ganhos do segmento agrupados por dia.
export const getVendasDoDiaCached = (config: SegmentConfig, from?: string, to?: string) =>
  unstable_cache(
    async (): Promise<{ data: DashboardData["vendasDoDia"]; warning?: string }> => {
      try {
        const owners = await fetchAllOwners();
        return { data: await fetchVendasDoDia(config, { from, to }, owners) };
      } catch (e) {
        return { data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar vendas do dia" };
      }
    },
    ["vendas-dia-v15-palestranteitem", config.id, from || "cur", to || "cur"],
    { revalidate: 600 }
  )();

// "Meta do mês": vendas ganhas por data de fechamento no período vs meta fixa.
export const getMonthGoalCached = (config: SegmentConfig, from?: string, to?: string, owner?: string) =>
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
    ["month-goal-v10-datas", config.id, from || "cur", to || "cur", owner || "all"],
    { revalidate: 600 }
  )();
