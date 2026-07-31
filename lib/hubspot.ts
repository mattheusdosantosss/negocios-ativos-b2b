// ============================================================
// HubSpot CRM v3 — cliente para o painel de Negócios Ativos
// ============================================================
//
// Escopo enxuto: negócios ATIVOS (snapshot ao vivo) de uma pipeline do
// HubSpot, agrupados por Closer (Proprietário do negócio). A pipeline, etapas
// e roster vêm de um SegmentConfig (lib/segments.ts) — este cliente é agnóstico
// a B2B/B2C. Sem admin, sem login.

import type { SegmentConfig } from "./segments";

const HUBSPOT_API = "https://api.hubapi.com";

const TOKEN = process.env.HUBSPOT_TOKEN;

// ID interno da pipeline por segmento. Sobrescrevível por env; defaults abaixo
// (confirmados no portal 49656171).
const PIPELINE_IDS: Record<string, string> = {
  b2b: process.env.HUBSPOT_PIPELINE_B2B || "default",
  b2c: process.env.HUBSPOT_PIPELINE_B2C || "725182862",
};

export function pipelineIdFor(config: SegmentConfig): string {
  return PIPELINE_IDS[config.id] || "default";
}

// Portal (Hub) ID — usado pra montar o link de cada negócio no HubSpot.
const PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "49656171";

// Link direto pro registro do negócio no HubSpot (objectTypeId de deals = 0-3).
export const dealUrl = (dealId: string): string =>
  `https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${dealId}`;

// ============================================================
// Tipos
// ============================================================

export type Deal = {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    hubspot_owner_id?: string;
    createdate?: string;
    /** Data de fechamento (Ganho/Perdido) — set automático do HubSpot. */
    closedate?: string;
    /** Data de qualificação — mesma definição usada nos outros painéis da PSA. */
    pipedrive___data_de_qualificacao?: string;
    /** "Last Activity Date" — última nota, ligação, e-mail, reunião ou tarefa registrada no negócio. */
    notes_last_updated?: string;
    /** Data prevista do evento contratado. */
    data_prevista_do_evento?: string;
    /** Temperatura Atual — leitura do curador: "Vou vender", "Forecast", "Café com leite", "Não levo fé". */
    temperatura_atual?: string;
    /** "Valor líquido -10%" — valor do negócio com 10% de desconto aplicado. */
    valor_liquido_b2c_10?: string;
    /** Perfil (Escala / Profissionalize-se / Iniciante). */
    perfil?: string;
    [key: string]: string | undefined;
  };
};

export type Owner = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  archived?: boolean;
};

// ============================================================
// Helpers
// ============================================================

function assertToken() {
  if (!TOKEN) {
    throw new Error("HUBSPOT_TOKEN não está configurado. Veja .env.example.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Roda `fn` sobre os itens em grupos de no máx `lim` em paralelo, com uma pausa
// curta entre as ondas — segura o limite por segundo do HubSpot.
async function mapLimit<T, R>(items: T[], lim: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += lim) {
    out.push(...(await Promise.all(items.slice(i, i + lim).map(fn))));
    if (i + lim < items.length) await sleep(100);
  }
  return out;
}

async function hsFetch<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  assertToken();
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  // Retry automático em 429 (rate limit) — até 6 tentativas com backoff
  if (res.status === 429 && attempt < 6) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * Math.pow(2, attempt);
    await sleep(waitMs);
    return hsFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) detail = parsed.message;
    } catch {
      // mantém o text bruto
    }
    throw new Error(`HubSpot ${res.status} em ${path}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ============================================================
// Owners
// ============================================================

type OwnersResponse = { results: Owner[]; paging?: { next?: { after: string } } };

export async function fetchAllOwners(): Promise<Map<string, Owner>> {
  const map = new Map<string, Owner>();
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const data: OwnersResponse = await hsFetch(`/crm/v3/owners?${qs}`);
    for (const o of data.results) map.set(o.id, o);
    after = data.paging?.next?.after;
  } while (after);
  return map;
}

export function ownerDisplayName(owner?: Owner): string {
  if (!owner) return "Sem dono";
  const first = owner.firstName?.trim() || "";
  const last = owner.lastName?.trim() || "";
  const full = `${first} ${last}`.trim();
  return full || owner.email || `Owner ${owner.id}`;
}

// ============================================================
// Deals — busca via Search API
// ============================================================

type SearchResponse<T> = {
  total: number;
  results: T[];
  paging?: { next?: { after: string } };
};

const DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "hubspot_owner_id",
  "createdate",
  "pipedrive___data_de_qualificacao",
  "notes_last_updated",
  "data_prevista_do_evento",
  "temperatura_atual",
  "valor_liquido_b2c_10",
  "perfil",
];

// Helpers de timezone (Brasília = UTC-3, sem DST desde 2019) pro filtro por
// Data de criação (createdate é datetime real).
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const brStartOfDayMs = (yyyymmdd: string): number => new Date(yyyymmdd).getTime() + BR_OFFSET_MS;
const brEndOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS + 86_400_000 - 1;

/** Busca todos os negócios da pipeline do segmento nas etapas informadas,
 *  paginando. Aplica o filtro por Data de criação (createdate) se `from`/`to`. */
async function fetchDealsInStages(
  config: SegmentConfig,
  stageIds: string[],
  opts?: { from?: string; to?: string; origem?: string[]; owner?: string }
): Promise<Deal[]> {
  if (stageIds.length === 0) return [];

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: "dealstage", operator: "IN", values: stageIds },
  ];

  if (opts?.from) {
    filters.push({ propertyName: "createdate", operator: "GTE", value: brStartOfDayMs(opts.from).toString() });
  }
  if (opts?.to) {
    filters.push({ propertyName: "createdate", operator: "LTE", value: brEndOfDayMs(opts.to).toString() });
  }
  if (opts?.origem && opts.origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }

  const all: Deal[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: DEAL_PROPS,
      limit: 100,
    };
    if (after) body.after = after;

    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;
    if (after) await sleep(150);
  } while (after);

  return all;
}

/**
 * Snapshot ao vivo: negócios que ESTÃO hoje na pipeline do segmento, numa das
 * etapas ATIVAS (config.stages). Sem `from`/`to`, mostra o funil inteiro; com
 * eles, filtra pela Data de criação (createdate) dentro do período.
 */
export function fetchActiveDeals(
  config: SegmentConfig,
  opts?: { from?: string; to?: string; origem?: string[]; owner?: string }
): Promise<Deal[]> {
  return fetchDealsInStages(config, config.stages.map((s) => s.id), opts);
}

/**
 * Negócios nas etapas de CHECKOUT do segmento (ex.: "Aguardando pagamento",
 * "Pagamento realizado"). Bloco à parte — não entra no total de ativos.
 * Segue o mesmo filtro de período por Data de criação. Vazio se o segmento
 * não tem etapas de checkout.
 */
export function fetchCheckoutDeals(config: SegmentConfig, opts?: { from?: string; to?: string }): Promise<Deal[]> {
  return fetchDealsInStages(config, config.checkoutStages.map((s) => s.id), opts);
}

const CLOSED_PROPS = [
  "closedate",
  "dealstage",
  "dealname",
  "amount",
  "valor_liquido_b2c_10",
  "hubspot_owner_id",
  "createdate",
  "temperatura_atual",
  "macro_tema",
];

/**
 * Negócios FECHADOS (Ganho + Perdido) cujo dono é um closer do roster —
 * base do gráfico "Tempo da reunião ao fechamento". Todo o histórico. UMA busca
 * paginada (owner IN roster), SEQUENCIAL — buscas paralelas estouravam o limite
 * por segundo do HubSpot (429). Negócio fechado é terminal → pode cachear.
 */
export async function fetchClosedCloserDeals(
  config: SegmentConfig,
  origem?: string[],
  owner?: string
): Promise<Deal[]> {
  const stages = [...config.wonStageIds, ...config.lostStageIds];
  // Com um closer selecionado, escopa a UM dono (ainda do roster); senão, o
  // roster inteiro do segmento.
  const ownerIds = owner ? [owner] : config.team.map((m) => m.ownerId);
  if (stages.length === 0 || ownerIds.length === 0) return [];

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: "dealstage", operator: "IN", values: stages },
    { propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds },
  ];
  if (origem && origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: origem });
  }

  const all: Deal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: CLOSED_PROPS,
      limit: 200,
    };
    if (after) body.after = after;
    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);
  return all;
}

// ------------------------------------------------------------------
// Reuniões (engagements) — 1ª reunião com um closer/curador por negócio
// ------------------------------------------------------------------

type AssocBatchResponse = { results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
type MeetingBatchResponse = {
  results?: Array<{
    id: string;
    properties: {
      hs_meeting_start_time?: string;
      hubspot_owner_id?: string;
      hs_meeting_outcome?: string;
      hs_meeting_title?: string;
      hs_meeting_source?: string;
    };
  }>;
};

type MeetingDetail = { start?: string; ownerId?: string; outcome?: string; title?: string; source?: string };

// Resultado da reunião que conta como "reunião realizada" (proposta apresentada).
// NO_SHOW / CANCELED / RESCHEDULED / SCHEDULED não contam.
const MEETING_OUTCOME_DONE = "COMPLETED";

/** Associações batch (v4) de um tipo de objeto para outro. Lotes de 100, no
 *  máx 5 em paralelo (segura o limite por segundo do HubSpot). */
async function fetchAssocIds(fromType: string, toType: string, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

  const responses = await mapLimit(chunks, 6, (chunk) =>
    hsFetch<AssocBatchResponse>(`/crm/v4/associations/${fromType}/${toType}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    })
  );
  for (const data of responses) {
    for (const r of data.results ?? []) {
      // toObjectId vem como número na v4; normaliza pra string (as chaves dos
      // mapas — from.id / meeting.id — são strings).
      map.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)));
    }
  }
  return map;
}

/** Lê "Hora de início da reunião" + dono de um lote de reuniões (100 por vez). */
async function fetchMeetingsByIds(meetingIds: string[]): Promise<Map<string, MeetingDetail>> {
  const map = new Map<string, MeetingDetail>();
  const chunks: string[][] = [];
  for (let i = 0; i < meetingIds.length; i += 100) chunks.push(meetingIds.slice(i, i + 100));

  const responses = await mapLimit(chunks, 6, (chunk) =>
    hsFetch<MeetingBatchResponse>(`/crm/v3/objects/meetings/batch/read`, {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_meeting_start_time", "hubspot_owner_id", "hs_meeting_outcome", "hs_meeting_title", "hs_meeting_source"],
        inputs: chunk.map((id) => ({ id })),
      }),
    })
  );
  for (const data of responses) {
    for (const m of data.results ?? []) {
      map.set(m.id, {
        start: m.properties.hs_meeting_start_time,
        ownerId: m.properties.hubspot_owner_id,
        outcome: m.properties.hs_meeting_outcome,
        title: m.properties.hs_meeting_title,
        source: m.properties.hs_meeting_source,
      });
    }
  }
  return map;
}

/**
 * Para cada negócio, a "Hora de início da reunião" MAIS ANTIGA entre as
 * reuniões que (a) têm dono = closer do segmento (config.team) E (b) foram de
 * fato REALIZADAS (hs_meeting_outcome = COMPLETED — ignora no-show, cancelada,
 * remarcada). Usa a associação DIRETA negócio→reunião (não via contato): um
 * contato pode ter vários negócios ao longo do tempo, e a reunião pertence ao
 * negócio da ocasião. Devolve dealId -> ISO da 1ª reunião concluída.
 */
export async function fetchFirstCloserMeeting(
  config: SegmentConfig,
  dealIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (dealIds.length === 0) return result;
  const closerIds = new Set(config.team.map((m) => m.ownerId));

  const dealMeetings = await fetchAssocIds("deals", "meetings", dealIds);
  const allMeetingIds = [...new Set([...dealMeetings.values()].flat())];
  if (allMeetingIds.length === 0) return result;
  const meetings = await fetchMeetingsByIds(allMeetingIds);

  for (const [dealId, mids] of dealMeetings) {
    let earliestMs = Infinity;
    let earliestIso: string | undefined;
    for (const mid of mids) {
      const m = meetings.get(mid);
      if (!m?.start || !m.ownerId || !closerIds.has(m.ownerId)) continue;
      if (m.outcome !== MEETING_OUTCOME_DONE) continue; // só reunião realizada
      const t = new Date(m.start).getTime();
      if (Number.isFinite(t) && t < earliestMs) {
        earliestMs = t;
        earliestIso = m.start;
      }
    }
    if (earliestIso) result.set(dealId, earliestIso);
  }
  return result;
}

/**
 * Negócios que ENTRARAM na etapa "Proposta enviada | 1° Follow" (base da taxa
 * de conversão Proposta → Ganho). Usa hs_v2_date_entered_<etapa> (HAS_PROPERTY).
 * Traz createdate + as datas de entrada em Ganho (pra marcar quem converteu).
 * Respeita origem e closer. Paginado, todo o histórico.
 */
export async function fetchConversionDeals(
  config: SegmentConfig,
  opts?: { origem?: string[]; owner?: string }
): Promise<Deal[]> {
  const propostaProp = `hs_v2_date_entered_${config.propostaStageId}`;
  const wonProps = config.wonStageIds.map((w) => `hs_v2_date_entered_${w}`);
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: propostaProp, operator: "HAS_PROPERTY" },
  ];
  if (opts?.origem && opts.origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }
  const properties = ["createdate"];
  const all: Deal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties, limit: 200 };
    if (after) body.after = after;
    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    all.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);
  return all;
}

export type ConversionCounts = {
  geral: { created: number; won: number };
  months: { key: string; created: number; won: number }[]; // últimos 24 meses
};

/**
 * Contagens pra taxa de conversão = GANHOS ÷ CRIADOS, por mês de criação. Usa
 * busca só de contagem (`limit:1`, lê `total`) — assim não esbarra no teto de
 * 10 mil registros da Search API. Geral (todo o histórico) + 24 meses. Respeita
 * origem/closer. Janela de mês no fuso de Brasília (bate com o filtro do HubSpot).
 */
export async function fetchConversionCounts(
  config: SegmentConfig,
  opts?: { origem?: string[]; owner?: string }
): Promise<ConversionCounts> {
  const base: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
  ];
  if (opts?.origem && opts.origem.length > 0) {
    base.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    base.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }
  const wonFilter = { propertyName: "dealstage", operator: "IN", values: config.wonStageIds };

  // Monta os filterGroups do denominador (que valem pro numerador tb, pois o
  // ganho é AND dentro de cada grupo). Se `conversionDenomAnyOf`, é um OR:
  // cada propriedade vira um grupo (base + extra + prop HAS_PROPERTY). Senão,
  // um único grupo com o filtro simples (ou nenhum).
  const groupsFor = (extra: typeof base) => {
    if (config.conversionDenomAnyOf && config.conversionDenomAnyOf.length > 0) {
      return config.conversionDenomAnyOf.map((prop) => ({
        filters: [...base, ...extra, { propertyName: prop, operator: "HAS_PROPERTY" }],
      }));
    }
    const denom = config.conversionDenomFilter ? [{ ...config.conversionDenomFilter }] : [];
    return [{ filters: [...base, ...extra, ...denom] }];
  };

  const count = async (extra: typeof base): Promise<number> => {
    const body = { filterGroups: groupsFor(extra), limit: 1 };
    const data = await hsFetch<{ total?: number }>(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data.total ?? 0;
  };

  // Janelas dos últimos 24 meses (fuso BR).
  const nowBr = new Date(Date.now() - BR_OFFSET_MS);
  let y = nowBr.getUTCFullYear();
  let m = nowBr.getUTCMonth(); // 0-based
  const windows: { key: string; startMs: number; endMs: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const startMs = Date.UTC(y, m, 1) + BR_OFFSET_MS;
    const nY = m === 11 ? y + 1 : y;
    const nM = m === 11 ? 0 : m + 1;
    const endMs = Date.UTC(nY, nM, 1) + BR_OFFSET_MS;
    windows.push({ key, startMs, endMs });
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }

  const dateProp = config.conversionDateProp; // "closedate" (B2B) ou "createdate" (B2C)
  const [geralCreated, geralWon] = await Promise.all([
    count([{ propertyName: dateProp, operator: "HAS_PROPERTY" }]),
    config.wonStageIds.length ? count([wonFilter]) : Promise.resolve(0),
  ]);

  const months = await mapLimit(windows, 4, async (w) => {
    const range = [
      { propertyName: dateProp, operator: "GTE", value: String(w.startMs) },
      { propertyName: dateProp, operator: "LT", value: String(w.endMs) },
    ];
    const [created, won] = await Promise.all([
      count(range),
      config.wonStageIds.length ? count([...range, wonFilter]) : Promise.resolve(0),
    ]);
    return { key: w.key, created, won };
  });

  return { geral: { created: geralCreated, won: geralWon }, months };
}

export type MotivosScope = { total: number; reasons: { name: string; count: number }[] };
export type MotivosData = { geral: MotivosScope; months: (MotivosScope & { key: string })[] };

/**
 * Distribuição dos motivos de perda (closed_lost_reason) dos negócios perdidos.
 * Limita aos últimos ~18 meses de fechamento (não estoura o teto de 10k da
 * Search) e agrupa por mês (fuso BR) + geral. Respeita origem/closer.
 */
export async function fetchLostReasons(
  config: SegmentConfig,
  opts?: { origem?: string[]; owner?: string }
): Promise<MotivosData> {
  if (config.lostStageIds.length === 0) return { geral: { total: 0, reasons: [] }, months: [] };
  // Últimos 6 meses de fechamento — o B2C perde ~1,2k/mês, então 18m estouraria
  // o teto de 10k da Search API. 6m (~7k) cabe com folga.
  const nowBr = new Date(Date.now() - BR_OFFSET_MS);
  const cutoff = Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth() - 5, 1) + BR_OFFSET_MS;
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: "dealstage", operator: "IN", values: config.lostStageIds },
    { propertyName: "closedate", operator: "GTE", value: String(cutoff) },
  ];
  if (opts?.origem && opts.origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }
  const deals: Deal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: ["closedate", "closed_lost_reason"],
      limit: 200,
    };
    if (after) body.after = after;
    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    deals.push(...data.results);
    after = data.paging?.next?.after;
  } while (after && deals.length < 9800); // blindagem contra o teto de 10k

  const monthKey = (iso?: string) => {
    const t = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(t)) return "sem-data";
    const d = new Date(t - BR_OFFSET_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const geral = new Map<string, number>();
  const byMonth = new Map<string, Map<string, number>>();
  for (const d of deals) {
    const reason = (d.properties.closed_lost_reason || "").trim() || "Sem motivo";
    geral.set(reason, (geral.get(reason) ?? 0) + 1);
    const k = monthKey(d.properties.closedate);
    if (k === "sem-data") continue;
    if (!byMonth.has(k)) byMonth.set(k, new Map());
    const m = byMonth.get(k)!;
    m.set(reason, (m.get(reason) ?? 0) + 1);
  }
  const toScope = (m: Map<string, number>): MotivosScope => {
    const reasons = [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return { total: reasons.reduce((s, r) => s + r.count, 0), reasons };
  };
  const months = [...byMonth.entries()]
    .map(([key, m]) => ({ key, ...toScope(m) }))
    .sort((a, b) => b.key.localeCompare(a.key));
  return { geral: toScope(geral), months };
}

export type PropostaMeetingItem = {
  dealname: string;
  url: string;
  meetingTitle?: string;
  meetingDate?: string;
  source?: string;
  outcome?: string;
};
export type PropostaMeetingData = {
  total: number;
  alguma: number;
  realizada: number;
  /** Listas por bucket pro popup (realizada / marcada não realizada / sem reunião). */
  deals: { realizada: PropostaMeetingItem[]; agendada: PropostaMeetingItem[]; sem: PropostaMeetingItem[] };
};

const meetMs = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/**
 * Dos negócios com proposta anexada (B2B), quantos tiveram reunião. Retorna
 * contagens (total / alguma / realizada) + as listas por bucket com a reunião
 * representativa (título, data, origem e resultado) pro popup. Via associação
 * direta negócio→reunião. Respeita origem/closer.
 */
export async function fetchPropostaMeetingStats(
  config: SegmentConfig,
  opts?: { origem?: string[]; owner?: string; from?: string; to?: string }
): Promise<PropostaMeetingData> {
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: "tem_proposta_anexada", operator: "EQ", value: "true" },
  ];
  if (opts?.origem && opts.origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }
  if (opts?.from) {
    filters.push({ propertyName: "createdate", operator: "GTE", value: brStartOfDayMs(opts.from).toString() });
  }
  if (opts?.to) {
    filters.push({ propertyName: "createdate", operator: "LTE", value: brEndOfDayMs(opts.to).toString() });
  }
  const deals: Deal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties: ["dealname"], limit: 200 };
    if (after) body.after = after;
    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    deals.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  const empty: PropostaMeetingData = { total: 0, alguma: 0, realizada: 0, deals: { realizada: [], agendada: [], sem: [] } };
  if (deals.length === 0) return empty;

  const dealMeetings = await fetchAssocIds("deals", "meetings", deals.map((d) => d.id));
  const allMeetingIds = [...new Set([...dealMeetings.values()].flat())];
  let meetings: Map<string, MeetingDetail> = new Map();
  if (allMeetingIds.length) meetings = await fetchMeetingsByIds(allMeetingIds);

  const out: PropostaMeetingData = { total: deals.length, alguma: 0, realizada: 0, deals: { realizada: [], agendada: [], sem: [] } };
  for (const d of deals) {
    const mids = (dealMeetings.get(d.id) ?? []).map((mid) => meetings.get(mid)).filter((m): m is MeetingDetail => !!m);
    const base = { dealname: d.properties.dealname || `Negócio ${d.id}`, url: dealUrl(d.id) };
    if (mids.length === 0) {
      out.deals.sem.push(base);
      continue;
    }
    out.alguma += 1;
    const completed = mids.filter((m) => m.outcome === MEETING_OUTCOME_DONE);
    const pick = (completed.length ? completed : mids).sort((a, b) => (meetMs(b.start) || 0) - (meetMs(a.start) || 0))[0];
    const item: PropostaMeetingItem = {
      ...base,
      meetingTitle: pick.title,
      meetingDate: pick.start,
      source: pick.source,
      outcome: pick.outcome,
    };
    if (completed.length) {
      out.realizada += 1;
      out.deals.realizada.push(item);
    } else {
      out.deals.agendada.push(item);
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Tarefas (tasks) — próxima tarefa aberta por negócio ativo
// ------------------------------------------------------------------

const TASK_PROPS = ["hs_task_status", "hs_timestamp"];

/** Lê status + data de vencimento (hs_timestamp) de um lote de tarefas. */
async function fetchTaskDuesByIds(
  taskIds: string[]
): Promise<Map<string, { status?: string; due?: string }>> {
  const map = new Map<string, { status?: string; due?: string }>();
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += 100) chunks.push(taskIds.slice(i, i + 100));
  const responses = await mapLimit(chunks, 6, (chunk) =>
    hsFetch<{ results?: Array<{ id: string; properties: { hs_task_status?: string; hs_timestamp?: string } }> }>(
      `/crm/v3/objects/tasks/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: TASK_PROPS, inputs: chunk.map((id) => ({ id })) }) }
    )
  );
  for (const data of responses)
    for (const t of data.results ?? [])
      map.set(t.id, { status: t.properties.hs_task_status, due: t.properties.hs_timestamp });
  return map;
}

/**
 * Para cada negócio, o vencimento (ms) da PRÓXIMA tarefa ABERTA — status !=
 * COMPLETED, menor hs_timestamp. Negócio sem tarefa aberta não entra no mapa
 * (o consumidor trata a ausência como "sem tarefa"). Usa a associação direta
 * negócio→tarefa, em lotes (mesma infra das reuniões).
 */
export async function fetchNextOpenTaskByDeal(dealIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (dealIds.length === 0) return result;
  const dealTasks = await fetchAssocIds("deals", "tasks", dealIds);
  const allTaskIds = [...new Set([...dealTasks.values()].flat())];
  if (allTaskIds.length === 0) return result;
  const tasks = await fetchTaskDuesByIds(allTaskIds);
  for (const [dealId, tids] of dealTasks) {
    let earliest = Infinity;
    for (const tid of tids) {
      const t = tasks.get(tid);
      if (!t || (t.status || "").toUpperCase() === "COMPLETED") continue; // só abertas
      const raw = t.due;
      const ms = raw ? new Date(Number.isNaN(Number(raw)) ? raw : Number(raw)).getTime() : NaN;
      if (Number.isFinite(ms) && ms < earliest) earliest = ms;
    }
    if (Number.isFinite(earliest)) result.set(dealId, earliest);
  }
  return result;
}

/**
 * Agregado dos negócios GANHOS do segmento (config.wonStageIds) — só contagem
 * e soma do amount, pro "ticket médio de ganho". Filtra por data de fechamento
 * (closedate) quando `from`/`to` são passados. Busca só a prop amount.
 */
export async function fetchWonAggregate(
  config: SegmentConfig,
  opts?: { from?: string; to?: string; origem?: string[]; owner?: string }
): Promise<{ count: number; valor: number }> {
  if (config.wonStageIds.length === 0) return { count: 0, valor: 0 };

  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
    { propertyName: "dealstage", operator: "IN", values: config.wonStageIds },
  ];
  if (opts?.from) {
    filters.push({ propertyName: "closedate", operator: "GTE", value: brStartOfDayMs(opts.from).toString() });
  }
  if (opts?.to) {
    filters.push({ propertyName: "closedate", operator: "LTE", value: brEndOfDayMs(opts.to).toString() });
  }
  if (opts?.origem && opts.origem.length > 0) {
    filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
  }
  if (opts?.owner) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  }

  let count = 0;
  let valor = 0;
  let after: string | undefined;
  do {
    // limit 200 (máx da Search API) e sem sleep entre páginas: menos
    // requisições, evita timeout no "Todo o período". O retry automático em
    // 429 já protege contra rate limit.
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: ["amount"],
      limit: 200,
    };
    if (after) body.after = after;

    const data: SearchResponse<Deal> = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    for (const d of data.results) {
      count += 1;
      valor += Number(d.properties.amount || 0) || 0;
    }
    after = data.paging?.next?.after;
  } while (after);

  return { count, valor };
}
