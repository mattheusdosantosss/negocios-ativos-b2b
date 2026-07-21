import {
  STAGES,
  STAGE_IDS,
  TEMP_STAGE_IDS,
  ownerDisplayName,
  dealUrl,
  type Deal,
  type Owner,
} from "./hubspot";
import { B2B_TEAM_IDS } from "./team";

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
  /** Id da Temperatura Atual (vou_vender / forecast / cafe / larguei / sem_leitura). */
  temp?: string;
  /** Vazio no modo de exemplo (sem HUBSPOT_TOKEN) — sem registro real no HubSpot. */
  url: string;
};

/** Qual campo de data cada popup exibe ao lado do valor. */
export type DateField = "createdate" | "qualdate" | "activitydate" | "eventdate";

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

export type CloserRow = {
  ownerId: string;
  nome: string;
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
  /** Matriz Temperatura Atual × etapa (4 etapas ativas, sem Resting). */
  tempPorEtapa: Record<string, Record<string, number>>;
  dealsTempPorEtapa: Record<string, Record<string, DealLite[]>>;
  total: number;
  valor: number;
};

export type DashboardData = {
  meta: { updatedAt: string; usingLiveData: boolean };
  stages: { id: string; label: string }[];
  totals: {
    total: number;
    valor: number;
    porEtapa: Record<string, number>;
    foraDoTimeB2B: number;
    eventoAtrasado: number;
    eventoProximo30: number;
    /** Matriz janela de evento (≤30 dias) × Temperatura, agregada. */
    eventoProx30PorTemp: Record<string, Record<string, number>>;
    /** Matriz Temperatura × etapa agregada (todos os closers). */
    tempPorEtapa: Record<string, Record<string, number>>;
    /** Negócios ganhos (fechado + contrato assinado) no período — pro ticket médio de ganho. */
    ganhoCount: number;
    ganhoValor: number;
  };
  closers: CloserRow[];
};

function emptyStageMap(): Record<string, number> {
  return Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
}

function emptyStageDealsMap(): Record<string, DealLite[]> {
  return Object.fromEntries(STAGE_IDS.map((id) => [id, []]));
}

function emptyBucketMap(ids: string[]): Record<string, number> {
  return Object.fromEntries([...ids, SEM_DATA_BUCKET].map((id) => [id, 0]));
}

function emptyBucketDealsMap(ids: string[]): Record<string, DealLite[]> {
  return Object.fromEntries([...ids, SEM_DATA_BUCKET].map((id) => [id, []]));
}

function emptyTempMatrix(): Record<string, Record<string, number>> {
  return Object.fromEntries(
    TEMP_STAGE_IDS.map((sid) => [sid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, 0]))])
  );
}

function emptyTempDealsMatrix(): Record<string, Record<string, DealLite[]>> {
  return Object.fromEntries(
    TEMP_STAGE_IDS.map((sid) => [sid, Object.fromEntries(TEMPERATURE_IDS.map((tid) => [tid, []]))])
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

export function aggregate(
  deals: Deal[],
  owners: Map<string, Owner>,
  won: { count: number; valor: number } = { count: 0, valor: 0 }
): Omit<DashboardData, "meta"> {
  const byOwner = new Map<string, CloserRow>();
  const now = Date.now();

  for (const deal of deals) {
    const stage = deal.properties.dealstage;
    if (!stage || !STAGE_IDS.includes(stage)) continue;

    const rawOwnerId = deal.properties.hubspot_owner_id || "";
    const resolvedOwner = rawOwnerId ? owners.get(rawOwnerId) : undefined;
    // Cada owner resolvido (mesmo fora do time B2B — farmer, SDR etc.) mantém
    // sua própria linha. Só quando o owner NÃO resolve (sem hubspot_owner_id,
    // ou ID que não bate com nenhum owner ativo) é que compila numa única
    // linha "Sem dono", em vez de uma linha por ID não resolvido.
    const ownerId = resolvedOwner ? rawOwnerId : SEM_DONO_ID;
    const amount = Number(deal.properties.amount || 0) || 0;

    let row = byOwner.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        nome: ownerId === SEM_DONO_ID ? SEM_DONO_LABEL : ownerDisplayName(resolvedOwner),
        porEtapa: emptyStageMap(),
        valorPorEtapa: emptyStageMap(),
        dealsPorEtapa: emptyStageDealsMap(),
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
        tempPorEtapa: emptyTempMatrix(),
        dealsTempPorEtapa: emptyTempDealsMatrix(),
        total: 0,
        valor: 0,
      };
      byOwner.set(ownerId, row);
    }

    const liquidoRaw = Number(deal.properties.valor_liquido_b2c_10 || "");
    const dealLite: DealLite = {
      id: deal.id,
      dealname: deal.properties.dealname || `Negócio ${deal.id}`,
      amount,
      valorLiquido: Number.isFinite(liquidoRaw) && liquidoRaw > 0 ? liquidoRaw : amount,
      createdate: deal.properties.createdate,
      qualdate: deal.properties.pipedrive___data_de_qualificacao,
      activitydate: deal.properties.notes_last_updated,
      eventdate: deal.properties.data_prevista_do_evento,
      temp: temperaturaId(deal.properties.temperatura_atual),
      url: dealUrl(deal.id),
    };

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
        const tid = temperaturaId(deal.properties.temperatura_atual);
        row.eventoProx30PorTemp[janela][tid] += 1;
        row.dealsEventoProx30PorTemp[janela][tid].push(dealLite);
      }
    }

    // Temperatura — só nas 4 etapas ativas (sem Resting).
    if (TEMP_STAGE_IDS.includes(stage)) {
      const tid = temperaturaId(deal.properties.temperatura_atual);
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
      STAGE_IDS.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])
    ),
    foraDoTimeB2B: closers.filter((c) => !B2B_TEAM_IDS.has(c.ownerId)).reduce((s, c) => s + c.total, 0),
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
      TEMP_STAGE_IDS.map((sid) => [
        sid,
        Object.fromEntries(
          TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.tempPorEtapa[sid][tid], 0)])
        ),
      ])
    ),
    ganhoCount: won.count,
    ganhoValor: won.valor,
  };

  return { stages: STAGES, totals, closers };
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

/** Convicção e cobertura gerais sobre a matriz inteira (4 etapas). */
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
  for (const sid of TEMP_STAGE_IDS) {
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

/** Todos os negócios ativos de um closer, juntando as 5 etapas (usado pela coluna Total/Valor). */
export function allDealsOf(row: CloserRow): DealLite[] {
  return STAGE_IDS.flatMap((id) => row.dealsPorEtapa[id]);
}

/** Todos os negócios de uma etapa, de TODOS os closers (usado pelo funil por etapa). */
export function dealsForStage(closers: CloserRow[], stageId: string): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsPorEtapa[stageId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}

/** Todos os negócios ativos de closers fora do time B2B (qualquer dono não listado em B2B_TEAM). */
export function dealsOutsideTeam(closers: CloserRow[]): AggregatedDealItem[] {
  return closers
    .filter((c) => !B2B_TEAM_IDS.has(c.ownerId))
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

