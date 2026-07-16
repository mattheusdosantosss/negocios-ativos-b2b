import { STAGES, STAGE_IDS, ownerDisplayName, dealUrl, type Deal, type Owner } from "./hubspot";
import { B2B_TEAM_IDS } from "./team";

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
  createdate?: string;
  /** Data de qualificação (pipedrive___data_de_qualificacao). */
  qualdate?: string;
  /** Data da última atividade (notes_last_updated). */
  activitydate?: string;
  /** Data prevista do evento (data_prevista_do_evento). */
  eventdate?: string;
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
// é de ~20-25 dias — "40+" é a faixa crítica (negócio muito além do ciclo).
export const AGING_BUCKETS: { id: string; label: string }[] = [
  { id: "0-20", label: "0–20 dias" },
  { id: "20-30", label: "20–30 dias" },
  { id: "30-40", label: "30–40 dias" },
  { id: "40+", label: "40+ dias" },
];
const AGING_BUCKET_IDS = AGING_BUCKETS.map((b) => b.id);

function bucketForQualificationDays(days: number): string {
  if (days < 20) return "0-20";
  if (days < 30) return "20-30";
  if (days < 40) return "30-40";
  return "40+";
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

// Faixas de negócios cuja Data Prevista do Evento ainda está no futuro
// (diffDays >= 0) — distribuição usada no card "Evento em até 30 dias".
export const EVENT_FUTURE_BUCKETS: { id: string; label: string }[] = [
  { id: "0-7", label: "0–7 dias" },
  { id: "8-15", label: "8–15 dias" },
  { id: "16-30", label: "16–30 dias" },
  { id: "30+", label: "30+ dias" },
];
const EVENT_FUTURE_BUCKET_IDS = EVENT_FUTURE_BUCKETS.map((b) => b.id);

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
  /** Distribuição de negócios com evento futuro (0-7/8-15/16-30/30+ dias). */
  porEventoFuturo: Record<string, number>;
  dealsPorEventoFuturo: Record<string, DealLite[]>;
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
    porEventoFuturo: Record<string, number>;
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

/** Property tipo "date" ("AAAA-MM-DD") ou "datetime" (ISO) — new Date() lê os dois. */
function parseDateMs(raw?: string): number {
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) && t > 0 ? t : NaN;
}

function daysSince(now: number, raw?: string): number {
  const t = parseDateMs(raw);
  return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : NaN;
}

export function aggregate(deals: Deal[], owners: Map<string, Owner>): Omit<DashboardData, "meta"> {
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
        porEventoFuturo: emptyBucketMap(EVENT_FUTURE_BUCKET_IDS),
        dealsPorEventoFuturo: emptyBucketDealsMap(EVENT_FUTURE_BUCKET_IDS),
        total: 0,
        valor: 0,
      };
      byOwner.set(ownerId, row);
    }

    const dealLite: DealLite = {
      id: deal.id,
      dealname: deal.properties.dealname || `Negócio ${deal.id}`,
      amount,
      createdate: deal.properties.createdate,
      qualdate: deal.properties.pipedrive___data_de_qualificacao,
      activitydate: deal.properties.notes_last_updated,
      eventdate: deal.properties.data_prevista_do_evento,
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
      } else {
        if (diffDays <= 30) {
          row.eventoProximo30 += 1;
          row.dealsEventoProximo30.push(dealLite);
        }
        const futuroBucket = bucketForFutureEventDays(diffDays);
        row.porEventoFuturo[futuroBucket] += 1;
        row.dealsPorEventoFuturo[futuroBucket].push(dealLite);
      }
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
    porEventoFuturo: Object.fromEntries(
      EVENT_FUTURE_BUCKET_IDS.map((id) => [id, closers.reduce((s, c) => s + c.porEventoFuturo[id], 0)])
    ),
  };

  return { stages: STAGES, totals, closers };
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

/** Negócios com Data Prevista do Evento nos próximos 30 dias, de TODOS os closers. */
export function dealsForEventoProximo30(closers: CloserRow[]): AggregatedDealItem[] {
  return closers.flatMap((c) => c.dealsEventoProximo30.map((d) => ({ ...d, ownerName: c.nome })));
}

/** Negócios de uma faixa de evento futuro (0-7/8-15/16-30/30+), de TODOS os closers. */
export function dealsForFutureEventBucket(closers: CloserRow[], bucketId: string): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsPorEventoFuturo[bucketId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}

