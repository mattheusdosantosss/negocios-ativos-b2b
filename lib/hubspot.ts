// ============================================================
// HubSpot CRM v3 — cliente para o painel de Negócios Ativos B2B
// ============================================================
//
// Escopo único e propositalmente enxuto: negócios ATIVOS (snapshot ao vivo,
// sem filtro de período) na pipeline "Funil de Vendas B2B", agrupados por
// Closer (Proprietário do negócio). Sem squads, sem admin, sem login.

const HUBSPOT_API = "https://api.hubapi.com";

const TOKEN = process.env.HUBSPOT_TOKEN;
export const PIPELINE_B2B = process.env.HUBSPOT_PIPELINE_B2B || "default";

// Etapas consideradas "negócio ativo" nessa pipeline, na ordem do funil.
// ATENÇÃO: nessa pipeline os IDs internos "closedwon"/"closedlost" foram
// renomeados pelo negócio para "Proposta enviada | 1° Follow"/"Em negociação"
// — NÃO são os estágios terminais de ganho/perda (confirmado via HubSpot).
// jul/2026: as etapas "Conexão" (presentationscheduled) e "Aguardando Envio
// de Proposta" (contractsent) foram removidas da pipeline B2B.
export const STAGES: { id: string; label: string }[] = [
  { id: "decisionmakerboughtin", label: "Reunião agendada / Qualificado" },
  { id: "closedwon", label: "Proposta enviada | 1° Follow" },
  { id: "closedlost", label: "Em negociação" },
  { id: "1167445770", label: "Negociação avançada" },
  { id: "1367665802", label: "Resting" },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

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
// Deals ativos — busca via Search API
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
];

// Helpers de timezone (Brasília = UTC-3, sem DST desde 2019) pro filtro por
// Data de criação (createdate é datetime real).
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const brStartOfDayMs = (yyyymmdd: string): number => new Date(yyyymmdd).getTime() + BR_OFFSET_MS;
const brEndOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS + 86_400_000 - 1;

/**
 * Snapshot ao vivo: negócios que ESTÃO hoje na pipeline B2B, em uma das
 * etapas ativas (STAGE_IDS). Sem `from`/`to`, mostra o funil inteiro; com
 * eles, filtra pela Data de criação (createdate) dentro do período.
 */
export async function fetchActiveDeals(opts?: { from?: string; to?: string }): Promise<Deal[]> {
  const filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: "pipeline", operator: "EQ", value: PIPELINE_B2B },
    { propertyName: "dealstage", operator: "IN", values: STAGE_IDS },
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
