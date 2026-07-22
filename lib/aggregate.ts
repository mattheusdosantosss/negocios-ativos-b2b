import { ownerDisplayName, dealUrl, type Deal, type Owner } from "./hubspot";
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
  /** Data da 1ª reunião com closer (hs_meeting_start_time mais antiga). */
  meetingdate?: string;
  /** Id da Temperatura Atual (vou_vender / forecast / cafe / larguei / sem_leitura). */
  temp?: string;
  /** Vazio no modo de exemplo (sem HUBSPOT_TOKEN) — sem registro real no HubSpot. */
  url: string;
};

/** Qual campo de data cada popup exibe ao lado do valor. */
export type DateField = "createdate" | "qualdate" | "activitydate" | "eventdate" | "meetingdate";

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

// Faixas de tempo (em dias) da criação do negócio até a reunião — usadas no
// gráfico "Tempo até a reunião".
export const MEETING_TIME_BUCKETS: { id: string; label: string }[] = [
  { id: "0-7", label: "0–7 dias" },
  { id: "8-15", label: "8–15 dias" },
  { id: "16-30", label: "16–30 dias" },
  { id: "30+", label: "30+ dias" },
];
export const MEETING_TIME_BUCKET_IDS = MEETING_TIME_BUCKETS.map((b) => b.id);

function bucketForMeetingDays(days: number): string {
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
    meetingWarning?: string;
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
    /** Negócios ganhos no período — pro ticket médio de ganho. */
    ganhoCount: number;
    ganhoValor: number;
  };
  closers: CloserRow[];
  /** Presente só nos segmentos com etapas de checkout. */
  checkout?: CheckoutData;
  /** Presente só nos segmentos com hasMeetingTime — distribuição do tempo da
   *  criação do negócio até a reunião, por temperatura. */
  meetingTime?: MeetingTimeData;
};

/** Distribuição "tempo até a reunião" (faixas de dias × temperatura). */
export type MeetingTimeData = {
  buckets: StageDef[];
  /** matrix[faixa][temperatura] = nº de negócios. */
  matrix: Record<string, Record<string, number>>;
  /** deals[faixa][temperatura] = negócios (pro popup clicável). */
  deals: Record<string, Record<string, AggregatedDealItem[]>>;
  total: number;
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
    // meetingdate é preenchido caso a caso (1ª reunião com closer), não vem do deal.
    temp: temperaturaId(deal.properties.temperatura_atual),
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

    // Temperatura — só nas etapas de temperatura do segmento.
    if (tempStageIds.includes(stage)) {
      const tid = dealLite.temp ?? "sem_leitura";
      row.tempPorEtapa[stage][tid] += 1;
      row.dealsTempPorEtapa[stage][tid].push(dealLite);
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

/**
 * Distribuição "tempo até a proposta": dias entre a criação do negócio e a 1ª
 * reunião com um closer/curador (a proposta é apresentada nessa reunião), em
 * faixas × Temperatura Atual. `meetingStartByDealId` mapeia dealId -> ISO da 1ª
 * reunião. Negócios sem reunião de closer ficam de fora. Dias negativos → 0.
 */
export function meetingTimeMatrix(
  deals: Deal[],
  meetingStartByDealId: Map<string, string>,
  owners: Map<string, Owner>
): MeetingTimeData {
  const matrix: Record<string, Record<string, number>> = Object.fromEntries(
    MEETING_TIME_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, 0]))])
  );
  const dealsMap: Record<string, Record<string, AggregatedDealItem[]>> = Object.fromEntries(
    MEETING_TIME_BUCKET_IDS.map((bid) => [bid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, []]))])
  );
  let total = 0;

  for (const deal of deals) {
    const startIso = meetingStartByDealId.get(deal.id);
    if (!startIso) continue;
    const meetMs = parseDateMs(startIso);
    if (!Number.isFinite(meetMs)) continue;
    const createMs = parseDateMs(deal.properties.createdate);
    if (!Number.isFinite(createMs)) continue;

    const days = Math.max(0, Math.floor((meetMs - createMs) / 86_400_000));
    const bucket = bucketForMeetingDays(days);
    const tid = temperaturaId(deal.properties.temperatura_atual);
    const { nome } = resolveOwner(deal, owners);
    matrix[bucket][tid] += 1;
    dealsMap[bucket][tid].push({ ...toDealLite(deal), meetingdate: startIso, ownerName: nome });
    total += 1;
  }

  return { buckets: MEETING_TIME_BUCKETS, matrix, deals: dealsMap, total };
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
