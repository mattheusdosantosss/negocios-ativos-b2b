import { ownerDisplayName, dealUrl, type Deal, type Owner, type PropostaMeetingData, type MotivosData, type MonthGoalData, type ReunioesPerfilData, type TempoPropostaData } from "./hubspot";
import type { GanhosAtributosData, LeadTimeGanhosData, ConvCloserData } from "./b2cCards";
import type { SegmentConfig, SegmentId, StageDef } from "./segments";
import { tempStagesOf } from "./segments";

// Temperatura Atual (leitura do curador). "Sem leitura" = campo vazio no
// HubSpot. A ordem aqui é a ordem de exibição (quente → frio).
export const TEMPERATURES: { id: string; label: string; raw: string | null }[] = [
  { id: "vou_vender", label: "Vou vender", raw: "Vou vender" },
  { id: "forecast", label: "Forecast", raw: "Forecast" },
  { id: "cafe", label: "Café com leite", raw: "Café com leite" },
  { id: "larguei", label: "Larguei de mão", raw: "Não levo fé" },
  { id: "sem_leitura", label: "Sem leitura", raw: null },
];
export const TEMPERATURE_IDS = TEMPERATURES.map((t) => t.id);
const TEMP_BY_RAW = new Map(TEMPERATURES.filter((t) => t.raw).map((t) => [t.raw as string, t.id]));

function temperaturaId(raw?: string): string {
  const v = (raw || "").trim();
  return (v && TEMP_BY_RAW.get(v)) || "sem_leitura";
}

// Perfil (perfil no HubSpot). "Sem perfil" = campo vazio. Mesma lógica de
// exibição da temperatura (empilhado por etapa), só que nesta dimensão.
export const PERFIS: { id: string; label: string; raw: string | null }[] = [
  { id: "escala", label: "Escala", raw: "Escala" },
  { id: "profissionalize", label: "Profissionalize-se", raw: "Profissionalize-se" },
  { id: "iniciante", label: "Iniciante", raw: "Iniciante" },
  { id: "sem_perfil", label: "Sem perfil", raw: null },
];
export const PERFIL_IDS = PERFIS.map((p) => p.id);
const PERFIL_BY_RAW = new Map(PERFIS.filter((p) => p.raw).map((p) => [p.raw as string, p.id]));

function perfilId(raw?: string): string {
  const v = (raw || "").trim();
  return (v && PERFIL_BY_RAW.get(v)) || "sem_perfil";
}

// Chave de agrupamento pra qualquer negócio cujo dono não dá pra resolver
// (sem hubspot_owner_id, ou owner não encontrado no mapa de owners). Compila
// tudo numa única linha "Sem dono" — antes cada owner não-resolvido virava
// uma linha própria (todas mostrando "Sem dono", mas sem se juntar).
const SEM_DONO_ID = "sem-dono";
const SEM_DONO_LABEL = "Sem dono";

export type DealLite = {
  id: string;
  dealname: string;
  amount: number;
  /** "Valor líquido -10%" (valor_liquido_b2c_10). Cai pro amount se vazio. */
  valorLiquido: number;
  createdate?: string;
  /** Data de qualificação (pipedrive___data_de_qualificacao). */
  qualdate?: string;
  /** Data da última atividade (notes_last_updated). */
  activitydate?: string;
  /** Data prevista do evento (data_prevista_do_evento). */
  eventdate?: string;
  /** Data da 1ª reunião concluída com closer (hs_meeting_start_time mais antiga). */
  meetingdate?: string;
  /** Data de fechamento (Ganho/Perdido) — closedate. */
  closedate?: string;
  /** Id da Temperatura Atual (vou_vender / forecast / cafe / larguei / sem_leitura). */
  temp?: string;
  /** Id do Perfil (escala / profissionalize / iniciante / sem_perfil). */
  perfil?: string;
  /** Vazio no modo de exemplo (sem HUBSPOT_TOKEN) — sem registro real no HubSpot. */
  url: string;
};

/** Qual campo de data cada popup exibe ao lado do valor. */
export type DateField =
  | "createdate"
  | "qualdate"
  | "activitydate"
  | "eventdate"
  | "meetingdate"
  | "closedate";

/** DealLite + nome do closer — usado nas listagens agregadas (todos os closers de uma etapa/faixa). */
export type AggregatedDealItem = DealLite & { ownerName: string };

// Bucket extra pra negócio sem a data em questão preenchida — só aparece na
// UI se tiver algum caso (não é mostrado nos arrays de buckets abaixo).
const SEM_DATA_BUCKET = "sem-data";

// Faixas de tempo desde a Data de qualificação (mesmo campo usado nos outros
// painéis da PSA: pipedrive___data_de_qualificacao). Ciclo de vendas da PSA
// é de ~20-25 dias — "30+" é a faixa crítica (negócio muito além do ciclo).
export const AGING_BUCKETS: { id: string; label: string }[] = [
  { id: "0-20", label: "0–20 dias" },
  { id: "20-30", label: "20–30 dias" },
  { id: "30+", label: "30+ dias" },
];
const AGING_BUCKET_IDS = AGING_BUCKETS.map((b) => b.id);

function bucketForQualificationDays(days: number): string {
  if (days < 20) return "0-20";
  if (days < 30) return "20-30";
  return "30+";
}

// Faixas de tempo desde a última atividade (notes_last_updated — última nota,
// ligação, e-mail, reunião ou tarefa registrada no negócio). "16+" é a faixa
// crítica (negócio parado sem contato há mais de 2 semanas).
export const ACTIVITY_BUCKETS: { id: string; label: string }[] = [
  { id: "0-2", label: "0–2 dias" },
  { id: "3-5", label: "3–5 dias" },
  { id: "6-10", label: "6–10 dias" },
  { id: "11-15", label: "11–15 dias" },
  { id: "16+", label: "16+ dias" },
];
const ACTIVITY_BUCKET_IDS = ACTIVITY_BUCKETS.map((b) => b.id);

function bucketForActivityDays(days: number): string {
  if (days <= 2) return "0-2";
  if (days <= 5) return "3-5";
  if (days <= 10) return "6-10";
  if (days <= 15) return "11-15";
  return "16+";
}

// Janelas de negócios cuja Data Prevista do Evento está nos próximos 30 dias.
// Usadas como "eixo" do gráfico "Evento em até 30 dias" (empilhado por
// temperatura). Sem "30+" — o card é só dos eventos dentro de 30 dias.
export const EVENT_30D_BUCKETS: { id: string; label: string }[] = [
  { id: "0-7", label: "0–7 dias" },
  { id: "8-15", label: "8–15 dias" },
  { id: "16-30", label: "16–30 dias" },
];
const EVENT_30D_BUCKET_IDS = EVENT_30D_BUCKETS.map((b) => b.id);

function bucketForFutureEventDays(days: number): string {
  if (days <= 7) return "0-7";
  if (days <= 15) return "8-15";
  if (days <= 30) return "16-30";
  return "30+";
}

// Faixas de tempo (em dias) da 1ª reunião concluída até o fechamento — usadas
// no gráfico "Tempo da reunião ao fechamento".
export const CLOSE_TIME_BUCKETS: { id: string; label: string }[] = [
  { id: "0-7", label: "0–7 dias" },
  { id: "8-15", label: "8–15 dias" },
  { id: "16-30", label: "16–30 dias" },
  { id: "30+", label: "30+ dias" },
];
export const CLOSE_TIME_BUCKET_IDS = CLOSE_TIME_BUCKETS.map((b) => b.id);

// Resultado do fechamento — as duas "séries" empilhadas no gráfico.
export const CLOSE_OUTCOMES: { id: string; label: string }[] = [
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
];
export const CLOSE_OUTCOME_IDS = CLOSE_OUTCOMES.map((o) => o.id);

function bucketForCloseDays(days: number): string {
  if (days <= 7) return "0-7";
  if (days <= 15) return "8-15";
  if (days <= 30) return "16-30";
  return "30+";
}

export type CloserRow = {
  ownerId: string;
  nome: string;
  /** O dono é do roster oficial do segmento? (métrica "fora do time"). */
  inTeam: boolean;
  porEtapa: Record<string, number>;
  valorPorEtapa: Record<string, number>;
  dealsPorEtapa: Record<string, DealLite[]>;
  porFaixa: Record<string, number>;
  dealsPorFaixa: Record<string, DealLite[]>;
  porAtividade: Record<string, number>;
  dealsPorAtividade: Record<string, DealLite[]>;
  /** Data Prevista do Evento já passou (negócio ainda ativo). */
  eventoAtrasado: number;
  dealsEventoAtrasado: DealLite[];
  /** Data Prevista do Evento dentro dos próximos 30 dias. */
  eventoProximo30: number;
  dealsEventoProximo30: DealLite[];
  /** Matriz janela de evento (≤30 dias: 0-7/8-15/16-30) × Temperatura. */
  eventoProx30PorTemp: Record<string, Record<string, number>>;
  dealsEventoProx30PorTemp: Record<string, Record<string, DealLite[]>>;
  /** Matriz Temperatura Atual × etapa (etapas de temperatura do segmento). */
  tempPorEtapa: Record<string, Record<string, number>>;
  dealsTempPorEtapa: Record<string, Record<string, DealLite[]>>;
  /** Matriz Perfil × etapa (mesmas etapas da temperatura). */
  perfilPorEtapa: Record<string, Record<string, number>>;
  dealsPerfilPorEtapa: Record<string, Record<string, DealLite[]>>;
  total: number;
  valor: number;
};

/** Bloco de checkout/pagamento (segmentos que têm essa fase, ex.: B2C). */
export type CheckoutData = {
  stages: StageDef[];
  porEtapa: Record<string, number>;
  valorPorEtapa: Record<string, number>;
  dealsPorEtapa: Record<string, AggregatedDealItem[]>;
  total: number;
  valor: number;
};

export type DashboardData = {
  meta: {
    updatedAt: string;
    usingLiveData: boolean;
    segment: SegmentId;
    /** Rótulo curto do segmento (B2B/B2C) e textos do hero. */
    label: string;
    eyebrow: string;
    pipelineName: string;
    /** Diagnóstico: mensagem se a leitura de reuniões falhar (ex.: falta de escopo). */
    closeTimeWarning?: string;
    /** Diagnóstico: mensagem se a leitura de tarefas falhar. */
    taskWarning?: string;
  };
  stages: StageDef[];
  /** Etapas que entram na visão de Temperatura (subconjunto de stages). */
  tempStages: StageDef[];
  totals: {
    total: number;
    valor: number;
    porEtapa: Record<string, number>;
    /** Negócios cujo dono não é do roster oficial do segmento. */
    foraDoTime: number;
    eventoAtrasado: number;
    eventoProximo30: number;
    /** Matriz janela de evento (≤30 dias) × Temperatura, agregada. */
    eventoProx30PorTemp: Record<string, Record<string, number>>;
    /** Matriz Temperatura × etapa agregada (todos os closers). */
    tempPorEtapa: Record<string, Record<string, number>>;
    /** Matriz Perfil × etapa agregada (todos os closers). */
    perfilPorEtapa: Record<string, Record<string, number>>;
    /** Negócios ganhos no período — pro ticket médio de ganho. */
    ganhoCount: number;
    ganhoValor: number;
  };
  closers: CloserRow[];
  /** Presente só nos segmentos com etapas de checkout. */
  checkout?: CheckoutData;
  /** Presente só nos segmentos com hasCloseTime — distribuição do tempo da 1ª
   *  reunião concluída com closer até o fechamento (Ganho/Perdido). */
  closeTime?: CloseTimeData;
  /** Presente só nos segmentos com hasMacroTema (B2B) — win rate por macro tema. */
  macroTema?: MacroTemaData;
  /** Situação das tarefas dos negócios ativos por etapa (B2B e B2C). */
  tasks?: TaskData;
  /** Taxa de conversão Proposta → Ganho (geral + por mês de criação). */
  conversion?: ConversionData;
  /** B2B: dos negócios com proposta anexada, quantos tiveram reunião. */
  propostaMeeting?: PropostaMeetingData;
  /** B2C: distribuição dos motivos de perda (geral + por mês de fechamento). */
  motivos?: MotivosData;
  /** B2C: reuniões por perfil (agendada/realizada/cancelada/no-show). */
  reunioesPerfil?: ReunioesPerfilData;
  /** B2C: ganhos por perfil / temperatura / lead score (item 7). */
  ganhosAtributos?: GanhosAtributosData;
  /** B2C: lead time dos ganhos (qualificação → ganho) (item 8). */
  leadTimeGanhos?: LeadTimeGanhosData;
  /** B2C: conversão por closer (coorte por criação) (item 9). */
  convCloser?: ConvCloserData;
  /** B2B: tempo (dias) da qualificação até a 1ª entrada na etapa de Proposta. */
  tempoProposta?: TempoPropostaData;
  /** B2B: progresso da meta do mês (soma da lista RANKING DE VENDAS | MÊS). */
  monthGoal?: MonthGoalData;
};

// Taxa de conversão Proposta → Ganho, por mês de criação.
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  const ab = MES_ABBR[Number(m) - 1] ?? m;
  return `${ab.charAt(0).toUpperCase()}${ab.slice(1)}/${y}`;
}

export type ConversionMonth = { key: string; label: string; entered: number; won: number; conv: number };
export type ConversionData = {
  geral: { entered: number; won: number; conv: number };
  months: ConversionMonth[]; // desc por key (mais recente primeiro)
  /** Como chamar o denominador na UI (ex.: "negócios criados", "com proposta anexada"). */
  denomLabel: string;
  /** Rótulo do seletor de mês (ex.: "Mês de criação", "Mês de fechamento"). */
  monthFilterLabel: string;
};

/**
 * Taxa de conversão = negócios GANHOS ÷ negócios CRIADOS, por mês de criação.
 * Recebe as contagens já apuradas (geral + meses) e só formata os rótulos.
 */
export function conversionFromCounts(
  counts: {
    geral: { created: number; won: number };
    months: { key: string; created: number; won: number }[];
  },
  denomLabel: string,
  monthFilterLabel: string
): ConversionData {
  const months: ConversionMonth[] = counts.months
    .map((m) => ({
      key: m.key,
      label: mesLabel(m.key),
      entered: m.created,
      won: m.won,
      conv: m.created > 0 ? m.won / m.created : 0,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
  const { created, won } = counts.geral;
  return {
    geral: { entered: created, won, conv: created > 0 ? won / created : 0 },
    months,
    denomLabel,
    monthFilterLabel,
  };
}

// Situação da PRÓXIMA tarefa aberta de um negócio ativo. Ordem = ordem de
// exibição na pilha (problemas primeiro).
export const TASK_CATEGORIES: { id: string; label: string }[] = [
  { id: "atrasada", label: "Tarefa atrasada" },
  { id: "sem_tarefa", label: "Sem tarefa" },
  { id: "prox24", label: "Próx. tarefa ≤ 24h" },
  { id: "mais24", label: "Próx. tarefa + 24h" },
];
const TASK_CAT_IDS = TASK_CATEGORIES.map((c) => c.id);

/** Classifica um negócio pela data (ms) da próxima tarefa aberta (ou ausência). */
function taskCategory(now: number, dueMs?: number): string {
  if (dueMs == null || !Number.isFinite(dueMs)) return "sem_tarefa";
  if (dueMs < now - 86_400_000) return "atrasada"; // vencida há mais de 24h
  if (dueMs <= now + 86_400_000) return "prox24"; // janela de ±24h (inclui vencida < 24h)
  return "mais24";
}

/** Situação das tarefas por etapa (matriz etapa × categoria de tarefa). */
export type TaskData = {
  stages: StageDef[];
  matrix: Record<string, Record<string, number>>;
  deals: Record<string, Record<string, AggregatedDealItem[]>>;
  total: number;
  /** Totais por categoria (pro subtítulo). */
  totals: Record<string, number>;
};

/**
 * Distribui os negócios ATIVOS por etapa × situação da próxima tarefa aberta.
 * `dueByDeal` mapeia dealId → vencimento (ms) da próxima tarefa aberta; a
 * ausência conta como "sem tarefa". `now` é o instante do request (pra janela
 * de 24h). Só as etapas informadas (as de temperatura do segmento).
 */
export function taskMatrix(
  deals: Deal[],
  dueByDeal: Map<string, number>,
  owners: Map<string, Owner>,
  stages: StageDef[],
  now: number
): TaskData {
  const stageIds = stages.map((s) => s.id);
  const stageSet = new Set(stageIds);
  const matrix: Record<string, Record<string, number>> = Object.fromEntries(
    stageIds.map((sid) => [sid, Object.fromEntries(TASK_CAT_IDS.map((c) => [c, 0]))])
  );
  const dealsMap: Record<string, Record<string, AggregatedDealItem[]>> = Object.fromEntries(
    stageIds.map((sid) => [sid, Object.fromEntries(TASK_CAT_IDS.map((c) => [c, []]))])
  );
  const totals: Record<string, number> = Object.fromEntries(TASK_CAT_IDS.map((c) => [c, 0]));
  let total = 0;
  for (const d of deals) {
    const stage = d.properties.dealstage;
    if (!stage || !stageSet.has(stage)) continue;
    const cat = taskCategory(now, dueByDeal.get(d.id));
    matrix[stage][cat] += 1;
    totals[cat] += 1;
    total += 1;
    const { nome } = resolveOwner(d, owners);
    dealsMap[stage][cat].push({ ...toDealLite(d), ownerName: nome });
  }
  return { stages, matrix, deals: dealsMap, total, totals };
}

/** Conversão (win rate) por macro tema. Uma linha por macro_tema com fechados. */
export type MacroTemaRow = {
  id: string; // valor cru do HubSpot ("12. MOTIVAÇÃO")
  label: string; // rótulo limpo ("Motivação")
  won: number;
  lost: number;
  total: number;
  conv: number; // won / total
};
export type MacroTemaData = {
  rows: MacroTemaRow[]; // ordenadas por conversão desc
  total: number;
  won: number;
  conv: number; // conversão geral
};

/** Contagem por dono → macro tema cru → { won, n }. Intermediário pra permitir
 *  filtrar por um subconjunto de closers (ex.: só os com pipeline ativo). */
export type MacroTemaByOwner = Record<string, Record<string, { won: number; n: number }>>;

/** Distribuição "tempo da reunião ao fechamento" (faixas de dias × Ganho/Perdido). */
export type CloseTimeData = {
  buckets: StageDef[];
  outcomes: StageDef[];
  /** matrix[faixa][won|lost] = nº de negócios. */
  matrix: Record<string, Record<string, number>>;
  /** deals[faixa][won|lost] = negócios (pro popup clicável). */
  deals: Record<string, Record<string, AggregatedDealItem[]>>;
  total: number;
  /** Mediana de dias reunião→fechamento (won, lost, geral). */
  medianDays: { won: number; lost: number; all: number };
};

function emptyMap(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

function emptyDealsMap(ids: string[]): Record<string, DealLite[]> {
  return Object.fromEntries(ids.map((id) => [id, []]));
}

function emptyBucketMap(ids: string[]): Record<string, number> {
  return Object.fromEntries([...ids, SEM_DATA_BUCKET].map((id) => [id, 0]));
}

function emptyBucketDealsMap(ids: string[]): Record<string, DealLite[]> {
  return Object.fromEntries([...ids, SEM_DATA_BUCKET].map((id) => [id, []]));
}

function emptyTempMatrix(tempStageIds: string[]): Record<string, Record<string, number>> {
  return Object.fromEntries(
    tempStageIds.map((sid) => [sid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, 0]))])
  );
}

function emptyTempDealsMatrix(tempStageIds: string[]): Record<string, Record<string, DealLite[]>> {
  return Object.fromEntries(
    tempStageIds.map((sid) => [sid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, []]))])
  );
}

function emptyPerfilMatrix(tempStageIds: string[]): Record<string, Record<string, number>> {
  return Object.fromEntries(
    tempStageIds.map((sid) => [sid, Object.fromEntries(PERFIL_IDS.map((pid) => [pid, 0]))])
  );
}

function emptyPerfilDealsMatrix(tempStageIds: string[]): Record<string, Record<string, DealLite[]>> {
  return Object.fromEntries(
    tempStageIds.map((sid) => [sid, Object.fromEntries(PERFIL_IDS.map((pid) => [pid, []]))])
  );
}

function emptyEvent30Matrix(): Record<string, Record<string, number>> {
  return Object.fromEntries(
    EVENT_30D_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, 0]))])
  );
}

function emptyEvent30DealsMatrix(): Record<string, Record<string, DealLite[]>> {
  return Object.fromEntries(
    EVENT_30D_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, []]))])
  );
}

/** Property tipo "date" ("AAAA-MM-DD") ou "datetime" (ISO) — new Date() lê os dois. */
function parseDateMs(raw?: string): number {
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) && t > 0 ? t : NaN;
}

function daysSince(now: number, raw?: string): number {
  const t = parseDateMs(raw);
  return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : NaN;
}

function toDealLite(deal: Deal): DealLite {
  const amount = Number(deal.properties.amount || 0) || 0;
  const liquidoRaw = Number(deal.properties.valor_liquido_b2c_10 || "");
  return {
    id: deal.id,
    dealname: deal.properties.dealname || `Negócio ${deal.id}`,
    amount,
    valorLiquido: Number.isFinite(liquidoRaw) && liquidoRaw > 0 ? liquidoRaw : amount,
    createdate: deal.properties.createdate,
    qualdate: deal.properties.pipedrive___data_de_qualificacao,
    activitydate: deal.properties.notes_last_updated,
    eventdate: deal.properties.data_prevista_do_evento,
    closedate: deal.properties.closedate,
    // meetingdate é preenchido caso a caso (1ª reunião com closer), não vem do deal.
    temp: temperaturaId(deal.properties.temperatura_atual),
    perfil: perfilId(deal.properties.perfil),
    url: dealUrl(deal.id),
  };
}

/** Resolve o dono do negócio (ou "Sem dono" se não der pra resolver). */
function resolveOwner(deal: Deal, owners: Map<string, Owner>): { ownerId: string; nome: string } {
  const rawOwnerId = deal.properties.hubspot_owner_id || "";
  const resolvedOwner = rawOwnerId ? owners.get(rawOwnerId) : undefined;
  const ownerId = resolvedOwner ? rawOwnerId : SEM_DONO_ID;
  const nome = ownerId === SEM_DONO_ID ? SEM_DONO_LABEL : ownerDisplayName(resolvedOwner);
  return { ownerId, nome };
}

function aggregateCheckout(
  checkoutDeals: Deal[],
  owners: Map<string, Owner>,
  config: SegmentConfig
): CheckoutData | undefined {
  if (config.checkoutStages.length === 0) return undefined;
  const stageIds = config.checkoutStages.map((s) => s.id);
  const porEtapa = emptyMap(stageIds);
  const valorPorEtapa = emptyMap(stageIds);
  const dealsPorEtapa: Record<string, AggregatedDealItem[]> = Object.fromEntries(stageIds.map((id) => [id, []]));
  let total = 0;
  let valor = 0;

  for (const deal of checkoutDeals) {
    const stage = deal.properties.dealstage;
    if (!stage || !stageIds.includes(stage)) continue;
    const { nome } = resolveOwner(deal, owners);
    const lite = toDealLite(deal);
    porEtapa[stage] += 1;
    valorPorEtapa[stage] += lite.amount;
    dealsPorEtapa[stage].push({ ...lite, ownerName: nome });
    total += 1;
    valor += lite.amount;
  }

  return { stages: config.checkoutStages, porEtapa, valorPorEtapa, dealsPorEtapa, total, valor };
}

export function aggregate(
  deals: Deal[],
  owners: Map<string, Owner>,
  won: { count: number; valor: number } = { count: 0, valor: 0 },
  config: SegmentConfig,
  checkoutDeals: Deal[] = []
): Omit<DashboardData, "meta"> {
  const stageIds = config.stages.map((s) => s.id);
  const tempStageIds = config.tempStageIds;
  const teamIds = new Set(config.team.map((m) => m.ownerId));

  const byOwner = new Map<string, CloserRow>();
  const now = Date.now();

  for (const deal of deals) {
    const stage = deal.properties.dealstage;
    if (!stage || !stageIds.includes(stage)) continue;

    const { ownerId, nome } = resolveOwner(deal, owners);
    const amount = Number(deal.properties.amount || 0) || 0;

    let row = byOwner.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        nome,
        inTeam: teamIds.has(ownerId),
        porEtapa: emptyMap(stageIds),
        valorPorEtapa: emptyMap(stageIds),
        dealsPorEtapa: emptyDealsMap(stageIds),
        porFaixa: emptyBucketMap(AGING_BUCKET_IDS),
        dealsPorFaixa: emptyBucketDealsMap(AGING_BUCKET_IDS),
        porAtividade: emptyBucketMap(ACTIVITY_BUCKET_IDS),
        dealsPorAtividade: emptyBucketDealsMap(ACTIVITY_BUCKET_IDS),
        eventoAtrasado: 0,
        dealsEventoAtrasado: [],
        eventoProximo30: 0,
        dealsEventoProximo30: [],
        eventoProx30PorTemp: emptyEvent30Matrix(),
        dealsEventoProx30PorTemp: emptyEvent30DealsMatrix(),
        tempPorEtapa: emptyTempMatrix(tempStageIds),
        dealsTempPorEtapa: emptyTempDealsMatrix(tempStageIds),
        perfilPorEtapa: emptyPerfilMatrix(tempStageIds),
        dealsPerfilPorEtapa: emptyPerfilDealsMatrix(tempStageIds),
        total: 0,
        valor: 0,
      };
      byOwner.set(ownerId, row);
    }

    const dealLite = toDealLite(deal);

    row.porEtapa[stage] += 1;
    row.valorPorEtapa[stage] += amount;
    row.dealsPorEtapa[stage].push(dealLite);
    row.total += 1;
    row.valor += amount;

    const qualDays = daysSince(now, deal.properties.pipedrive___data_de_qualificacao);
    const faixaBucket = Number.isFinite(qualDays) ? bucketForQualificationDays(qualDays) : SEM_DATA_BUCKET;
    row.porFaixa[faixaBucket] += 1;
    row.dealsPorFaixa[faixaBucket].push(dealLite);

    const atividadeDays = daysSince(now, deal.properties.notes_last_updated);
    const atividadeBucket = Number.isFinite(atividadeDays)
      ? bucketForActivityDays(atividadeDays)
      : SEM_DATA_BUCKET;
    row.porAtividade[atividadeBucket] += 1;
    row.dealsPorAtividade[atividadeBucket].push(dealLite);

    const eventoMs = parseDateMs(deal.properties.data_prevista_do_evento);
    if (Number.isFinite(eventoMs)) {
      const diffDays = Math.floor((eventoMs - now) / 86_400_000);
      if (diffDays < 0) {
        row.eventoAtrasado += 1;
        row.dealsEventoAtrasado.push(dealLite);
      } else if (diffDays <= 30) {
        row.eventoProximo30 += 1;
        row.dealsEventoProximo30.push(dealLite);
        // Janela (0-7/8-15/16-30) × temperatura, pro gráfico "Evento em 30 dias".
        const janela = bucketForFutureEventDays(diffDays);
        const tid = dealLite.temp ?? "sem_leitura";
        row.eventoProx30PorTemp[janela][tid] += 1;
        row.dealsEventoProx30PorTemp[janela][tid].push(dealLite);
      }
    }

    // Temperatura e Perfil — só nas etapas de temperatura do segmento.
    if (tempStageIds.includes(stage)) {
      const tid = dealLite.temp ?? "sem_leitura";
      row.tempPorEtapa[stage][tid] += 1;
      row.dealsTempPorEtapa[stage][tid].push(dealLite);

      const pid = dealLite.perfil ?? "sem_perfil";
      row.perfilPorEtapa[stage][pid] += 1;
      row.dealsPerfilPorEtapa[stage][pid].push(dealLite);
    }
  }

  const closers = [...byOwner.values()].sort(
    (a, b) => b.total - a.total || b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR")
  );

  const totals = {
    total: closers.reduce((s, c) => s + c.total, 0),
    valor: closers.reduce((s, c) => s + c.valor, 0),
    porEtapa: Object.fromEntries(
      stageIds.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])
    ),
    foraDoTime: closers.filter((c) => !c.inTeam).reduce((s, c) => s + c.total, 0),
    eventoAtrasado: closers.reduce((s, c) => s + c.eventoAtrasado, 0),
    eventoProximo30: closers.reduce((s, c) => s + c.eventoProximo30, 0),
    eventoProx30PorTemp: Object.fromEntries(
      EVENT_30D_BUCKET_IDS.map((bid) => [
        bid,
        Object.fromEntries(
          TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.eventoProx30PorTemp[bid][tid], 0)])
        ),
      ])
    ),
    tempPorEtapa: Object.fromEntries(
      tempStageIds.map((sid) => [
        sid,
        Object.fromEntries(
          TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.tempPorEtapa[sid][tid], 0)])
        ),
      ])
    ),
    perfilPorEtapa: Object.fromEntries(
      tempStageIds.map((sid) => [
        sid,
        Object.fromEntries(
          PERFIL_IDS.map((pid) => [pid, closers.reduce((s, c) => s + c.perfilPorEtapa[sid][pid], 0)])
        ),
      ])
    ),
    ganhoCount: won.count,
    ganhoValor: won.valor,
  };

  return {
    stages: config.stages,
    tempStages: tempStagesOf(config),
    totals,
    closers,
    checkout: aggregateCheckout(checkoutDeals, owners, config),
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Distribuição "tempo da reunião ao fechamento": dias entre a 1ª reunião
 * concluída com closer e a data de fechamento (Ganho/Perdido), em faixas ×
 * resultado (won/lost). `meetingStartByDealId` mapeia dealId -> ISO da 1ª
 * reunião concluída. Negócio sem reunião de closer ou sem closedate fica de
 * fora. Dias negativos (reunião registrada após o fechamento) → 0.
 */
export function closeTimeMatrix(
  deals: Deal[],
  meetingStartByDealId: Map<string, string>,
  owners: Map<string, Owner>,
  wonStageIds: string[]
): CloseTimeData {
  const wonSet = new Set(wonStageIds);
  const matrix: Record<string, Record<string, number>> = Object.fromEntries(
    CLOSE_TIME_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(CLOSE_OUTCOME_IDS.map((o) => [o, 0]))])
  );
  const dealsMap: Record<string, Record<string, AggregatedDealItem[]>> = Object.fromEntries(
    CLOSE_TIME_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(CLOSE_OUTCOME_IDS.map((o) => [o, []]))])
  );
  const daysArr: Record<string, number[]> = { won: [], lost: [] };
  let total = 0;

  for (const deal of deals) {
    const startIso = meetingStartByDealId.get(deal.id);
    if (!startIso) continue;
    const meetMs = parseDateMs(startIso);
    if (!Number.isFinite(meetMs)) continue;
    const closeMs = parseDateMs(deal.properties.closedate);
    if (!Number.isFinite(closeMs)) continue;

    const days = Math.max(0, Math.floor((closeMs - meetMs) / 86_400_000));
    const bucket = bucketForCloseDays(days);
    const outcome = wonSet.has(deal.properties.dealstage || "") ? "won" : "lost";
    const { nome } = resolveOwner(deal, owners);
    matrix[bucket][outcome] += 1;
    dealsMap[bucket][outcome].push({ ...toDealLite(deal), meetingdate: startIso, ownerName: nome });
    daysArr[outcome].push(days);
    total += 1;
  }

  return {
    buckets: CLOSE_TIME_BUCKETS,
    outcomes: CLOSE_OUTCOMES,
    matrix,
    deals: dealsMap,
    total,
    medianDays: {
      won: median(daysArr.won),
      lost: median(daysArr.lost),
      all: median([...daysArr.won, ...daysArr.lost]),
    },
  };
}

// Rótulo limpo do macro tema: tira o prefixo "N. " e aplica caixa de título
// pt-BR (conectores minúsculos). "12. MOTIVAÇÃO" -> "Motivação".
const PT_MINOR = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
function macroTemaLabel(raw: string): string {
  return raw
    .replace(/^\d+\.\s*/, "")
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((w, i) => (i > 0 && PT_MINOR.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join(" ");
}

/**
 * Win rate por macro tema sobre os negócios FECHADOS (Ganho + Perdido) — uma
 * linha por macro_tema preenchido, ordenada por conversão desc. Sem corte de
 * volume (mostra todos os temas); o `total` deixa claro quando a amostra é
 * pequena. `deals` deve ser a base de fechados dos closers (já filtrada por
 * closer/origem quando aplicável).
 */
export function macroTemaByOwner(deals: Deal[], wonStageIds: string[]): MacroTemaByOwner {
  const wonSet = new Set(wonStageIds);
  const map: MacroTemaByOwner = {};
  for (const d of deals) {
    const raw = (d.properties.macro_tema || "").trim();
    if (!raw) continue;
    const owner = d.properties.hubspot_owner_id || SEM_DONO_ID;
    const byTema = (map[owner] ??= {});
    const cur = (byTema[raw] ??= { won: 0, n: 0 });
    cur.n += 1;
    if (wonSet.has(d.properties.dealstage || "")) cur.won += 1;
  }
  return map;
}

/**
 * Consolida a contagem por-dono numa distribuição por macro tema. Se
 * `allowOwners` for passado, conta só os donos desse conjunto (ex.: closers
 * com pipeline ativo). Ordena por conversão desc.
 */
export function macroTemaFromByOwner(map: MacroTemaByOwner, allowOwners?: Set<string>): MacroTemaData {
  const agg = new Map<string, { won: number; n: number }>();
  for (const [owner, temas] of Object.entries(map)) {
    if (allowOwners && !allowOwners.has(owner)) continue;
    for (const [raw, v] of Object.entries(temas)) {
      const cur = agg.get(raw) ?? { won: 0, n: 0 };
      cur.won += v.won;
      cur.n += v.n;
      agg.set(raw, cur);
    }
  }
  const rows: MacroTemaRow[] = [...agg.entries()]
    .map(([id, v]) => ({
      id,
      label: macroTemaLabel(id),
      won: v.won,
      lost: v.n - v.won,
      total: v.n,
      conv: v.n > 0 ? v.won / v.n : 0,
    }))
    .sort((a, b) => b.conv - a.conv || b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
  const total = rows.reduce((s, r) => s + r.total, 0);
  const won = rows.reduce((s, r) => s + r.won, 0);
  return { rows, total, won, conv: total > 0 ? won / total : 0 };
}

/** Negócios de uma etapa+temperatura, de TODOS os closers (bloco geral). */
export function dealsForTemp(
  closers: CloserRow[],
  stageId: string,
  tempId: string
): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsTempPorEtapa[stageId]?.[tempId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}

/** Soma de uma temperatura numa etapa, na matriz agregada. */
export function tempStageTotal(matrix: Record<string, Record<string, number>>, stageId: string): number {
  return TEMPERATURE_IDS.reduce((s, tid) => s + (matrix[stageId]?.[tid] ?? 0), 0);
}

/** Negócios de uma etapa+perfil, de TODOS os closers (bloco geral). */
export function dealsForPerfil(
  closers: CloserRow[],
  stageId: string,
  perfilCat: string
): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsPerfilPorEtapa[stageId]?.[perfilCat] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}

/** Convicção de uma etapa = "Vou vender" ÷ lidos (total - sem leitura). */
export function conviccaoEtapa(matrix: Record<string, Record<string, number>>, stageId: string): number {
  const total = tempStageTotal(matrix, stageId);
  const semLeitura = matrix[stageId]?.sem_leitura ?? 0;
  const lidos = total - semLeitura;
  return lidos > 0 ? (matrix[stageId]?.vou_vender ?? 0) / lidos : 0;
}

/** Convicção e cobertura gerais sobre a matriz inteira (etapas de temperatura). */
export function conviccaoGeral(matrix: Record<string, Record<string, number>>): {
  total: number;
  lidos: number;
  semLeitura: number;
  vouVender: number;
  conviccao: number;
  cobertura: number;
} {
  let total = 0;
  let semLeitura = 0;
  let vouVender = 0;
  for (const sid of Object.keys(matrix)) {
    total += tempStageTotal(matrix, sid);
    semLeitura += matrix[sid]?.sem_leitura ?? 0;
    vouVender += matrix[sid]?.vou_vender ?? 0;
  }
  const lidos = total - semLeitura;
  return {
    total,
    lidos,
    semLeitura,
    vouVender,
    conviccao: lidos > 0 ? vouVender / lidos : 0,
    cobertura: total > 0 ? lidos / total : 0,
  };
}

/** Todos os negócios ativos de um closer, juntando as etapas (coluna Total/Valor). */
export function allDealsOf(row: CloserRow): DealLite[] {
  return Object.values(row.dealsPorEtapa).flat();
}

/** Todos os negócios de uma etapa, de TODOS os closers (usado pelo funil por etapa). */
export function dealsForStage(closers: CloserRow[], stageId: string): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsPorEtapa[stageId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}

/** Todos os negócios ativos de closers fora do roster oficial do segmento. */
export function dealsOutsideTeam(closers: CloserRow[]): AggregatedDealItem[] {
  return closers
    .filter((c) => !c.inTeam)
    .flatMap((c) => allDealsOf(c).map((d) => ({ ...d, ownerName: c.nome })));
}

/** Negócios cuja Data Prevista do Evento já passou, de TODOS os closers. */
export function dealsForEventoAtrasado(closers: CloserRow[]): AggregatedDealItem[] {
  return closers.flatMap((c) => c.dealsEventoAtrasado.map((d) => ({ ...d, ownerName: c.nome })));
}

/** Negócios marcados como "Forecast" na Temperatura Atual, de TODOS os closers (qualquer etapa). */
export function dealsForecast(closers: CloserRow[]): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    allDealsOf(c)
      .filter((d) => d.temp === "forecast")
      .map((d) => ({ ...d, ownerName: c.nome }))
  );
}

/** Negócios com Data Prevista do Evento nos próximos 30 dias, de TODOS os closers. */
export function dealsForEventoProximo30(closers: CloserRow[]): AggregatedDealItem[] {
  return closers.flatMap((c) => c.dealsEventoProximo30.map((d) => ({ ...d, ownerName: c.nome })));
}

/** Negócios de uma janela de evento (≤30 dias) + temperatura, de TODOS os closers. */
export function dealsForEvento30Temp(
  closers: CloserRow[],
  bucketId: string,
  tempId: string
): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsEventoProx30PorTemp[bucketId]?.[tempId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}
