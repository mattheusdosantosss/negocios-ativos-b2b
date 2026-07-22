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

  // Retry automático em 429 (rate limit) — até 3 tentativas com backoff
  if (res.status === 429 && attempt < 3) {
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
  opts?: { from?: string; to?: string }
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
export function fetchActiveDeals(config: SegmentConfig, opts?: { from?: string; to?: string }): Promise<Deal[]> {
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

/**
 * Negócios AINDA EM ABERTO (etapas ativas + checkout, sem Ganho/Perdido) do
 * segmento — base do gráfico "Tempo até a proposta". Todo o histórico (sem
 * filtro de período), pra medir o ciclo de quem está no funil.
 */
export function fetchOpenDeals(config: SegmentConfig): Promise<Deal[]> {
  const openStageIds = [...config.stages, ...config.checkoutStages].map((s) => s.id);
  return fetchDealsInStages(config, openStageIds);
}

// ------------------------------------------------------------------
// Reuniões (engagements) — 1ª reunião com um closer/curador por negócio
// ------------------------------------------------------------------

type AssocBatchResponse = { results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
type MeetingBatchResponse = {
  results?: Array<{ id: string; properties: { hs_meeting_start_time?: string; hubspot_owner_id?: string } }>;
};

/** Associações batch (v4) de um tipo de objeto para outro, em lotes de 100. */
async function fetchAssocIds(fromType: string, toType: string, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data: AssocBatchResponse = await hsFetch(`/crm/v4/associations/${fromType}/${toType}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    for (const r of data.results ?? []) {
      // toObjectId vem como número na v4; normaliza pra string (as chaves dos
      // mapas — from.id / meeting.id — são strings).
      map.set(r.from.id, (r.to ?? []).map((t) => String(t.toObjectId)));
    }
    if (i + 100 < ids.length) await sleep(120);
  }
  return map;
}

/** Lê "Hora de início da reunião" + dono de um lote de reuniões (100 por vez). */
async function fetchMeetingsByIds(
  meetingIds: string[]
): Promise<Map<string, { start?: string; ownerId?: string }>> {
  const map = new Map<string, { start?: string; ownerId?: string }>();
  for (let i = 0; i < meetingIds.length; i += 100) {
    const chunk = meetingIds.slice(i, i + 100);
    const data: MeetingBatchResponse = await hsFetch(`/crm/v3/objects/meetings/batch/read`, {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_meeting_start_time", "hubspot_owner_id"],
        inputs: chunk.map((id) => ({ id })),
      }),
    });
    for (const m of data.results ?? []) {
      map.set(m.id, { start: m.properties.hs_meeting_start_time, ownerId: m.properties.hubspot_owner_id });
    }
    if (i + 100 < meetingIds.length) await sleep(120);
  }
  return map;
}

/**
 * Para cada negócio, a "Hora de início da reunião" MAIS ANTIGA entre as
 * reuniões cujo dono é um closer/curador do segmento (config.team). As reuniões
 * ficam associadas ao CONTATO (não ao negócio), então o caminho é
 * negócio → contatos → reuniões. Devolve dealId -> ISO da 1ª reunião com closer.
 */
export async function fetchFirstCloserMeeting(
  config: SegmentConfig,
  dealIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (dealIds.length === 0) return result;
  const closerIds = new Set(config.team.map((m) => m.ownerId));

  const dealContacts = await fetchAssocIds("deals", "contacts", dealIds);
  const allContactIds = [...new Set([...dealContacts.values()].flat())];
  if (allContactIds.length === 0) return result;
  const contactMeetings = await fetchAssocIds("contacts", "meetings", allContactIds);
  const allMeetingIds = [...new Set([...contactMeetings.values()].flat())];
  if (allMeetingIds.length === 0) return result;
  const meetings = await fetchMeetingsByIds(allMeetingIds);

  for (const [dealId, contactIds] of dealContacts) {
    let earliestMs = Infinity;
    let earliestIso: string | undefined;
    for (const cid of contactIds) {
      for (const mid of contactMeetings.get(cid) ?? []) {
        const m = meetings.get(mid);
        if (!m?.start || !m.ownerId || !closerIds.has(m.ownerId)) continue;
        const t = new Date(m.start).getTime();
        if (Number.isFinite(t) && t < earliestMs) {
          earliestMs = t;
          earliestIso = m.start;
        }
      }
    }
    if (earliestIso) result.set(dealId, earliestIso);
  }
  return result;
}

/** Diagnóstico temporário: mostra o caminho negócio→contato→reunião e os donos
 *  das reuniões encontradas (pra checar o filtro de closer). */
export async function debugMeetings(config: SegmentConfig, dealIds: string[]) {
  const sample = dealIds.slice(0, 25);
  const dealContacts = await fetchAssocIds("deals", "contacts", sample);
  const contactIds = [...new Set([...dealContacts.values()].flat())];
  const contactMeetings = contactIds.length ? await fetchAssocIds("contacts", "meetings", contactIds) : new Map();
  const meetingIds = [...new Set([...contactMeetings.values()].flat())];
  const meetings = meetingIds.length ? await fetchMeetingsByIds(meetingIds) : new Map();
  const ownerCounts: Record<string, number> = {};
  const starts: string[] = [];
  for (const m of meetings.values()) {
    const o = m.ownerId || "(sem dono)";
    ownerCounts[o] = (ownerCounts[o] || 0) + 1;
    if (m.start) starts.push(m.start);
  }
  return {
    sampleDeals: sample.length,
    dealsComContato: dealContacts.size,
    contatos: contactIds.length,
    reunioes: meetings.size,
    reunioesComHora: starts.length,
    closerIds: config.team.map((m) => m.ownerId),
    donosDasReunioes: ownerCounts,
    amostraHoras: starts.slice(0, 8),
  };
}

/**
 * Agregado dos negócios GANHOS do segmento (config.wonStageIds) — só contagem
 * e soma do amount, pro "ticket médio de ganho". Filtra por data de fechamento
 * (closedate) quando `from`/`to` são passados. Busca só a prop amount.
 */
export async function fetchWonAggregate(
  config: SegmentConfig,
  opts?: { from?: string; to?: string }
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
