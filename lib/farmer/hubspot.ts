// ============================================================
// HubSpot CRM v3 — cliente para o painel dos líderes táticos
// ============================================================
//
// Versão enxuta do cliente do dashboard de farmers (psa-farmer). Mantém
// só o que o painel dos líderes precisa:
//   - owners (traduz ID → nome)
//   - deals qualificados no período  → Demandas
//   - deals fechados/ganhos no período → Negócios fechados + Receita
//   - tickets CS "em andamento" (snapshot) → Tramitações em andamento
//
// DIFERENÇA-CHAVE vs psa-farmer: aqui a origem do lead é SÓ "Carteira do
// Farmer" (exclui "Curador"). Tudo que o painel mostra é, por definição,
// demanda levantada pela carteira do farmer.

const HUBSPOT_API = "https://api.hubapi.com";

const TOKEN = process.env.HUBSPOT_TOKEN;
const STAGE_NEGOCIO_FECHADO = process.env.HUBSPOT_STAGE_NEGOCIO_FECHADO || "1076664462";
const STAGE_GANHO_CONTRATO = process.env.HUBSPOT_STAGE_GANHO_CONTRATO || "1076664460";
const STAGE_PERDIDO = process.env.HUBSPOT_STAGE_PERDIDO || "1076664461";
const PIPELINE_CS = process.env.HUBSPOT_PIPELINE_CS || "";

export const STAGES = {
  NEGOCIO_FECHADO: STAGE_NEGOCIO_FECHADO,
  GANHO_CONTRATO: STAGE_GANHO_CONTRATO,
  PERDIDO: STAGE_PERDIDO,
};

// "Negócio fechado" no painel = deal GANHO (contrato assinado).
export const GANHO_STAGES = [STAGE_NEGOCIO_FECHADO, STAGE_GANHO_CONTRATO];

// Estágios finais do funil (ganho ou perdido). Um deal que NÃO está em nenhum
// destes ainda está "em aberto" na esteira. Mesma definição do psa-farmer.
export const ESTADO_FINAL_STAGES = [STAGE_NEGOCIO_FECHADO, STAGE_GANHO_CONTRATO, STAGE_PERDIDO];

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
    createdate?: string;
    closedate?: string;
    sdrfarmer_responsavel?: string;
    pipedrive___data_de_qualificacao?: string;
    origem_do_lead?: string;
    origem_da_qualificacao?: string;
    pontuacao_leadscore?: string;
    criterios_atendidos?: string;
    /** Motivo de fechamento perdido. "Fora do MOA" é excluído das demandas.
     *  No B2B o motivo pode estar em qualquer uma das duas propriedades. */
    closed_lost_reason?: string;
    motivo_de_sinalizacao_de_perda?: string;
    /**
     * "Valor total do contrato (Bruto) (GANHO)" no HubSpot.
     * Só preenchido em deals fechados como ganho. É o BRUTO oficial.
     * Note os underscores no internal name: __bruto___ganho_ (2-3-1).
     */
    valor_total_do_contrato__bruto___ganho_?: string;
    [key: string]: string | undefined;
  };
};

export type Ticket = {
  id: string;
  properties: {
    subject?: string;
    hubspot_owner_id?: string;
    hs_pipeline?: string;
    hs_pipeline_stage?: string;
    createdate?: string;
    [key: string]: string | undefined;
  };
};

export type Owner = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  userId?: number; // ID de usuário do HubSpot (≠ ownerId) — usado em reuniões
  archived?: boolean;
};

export type Meeting = {
  id: string;
  properties: {
    hs_meeting_title?: string;
    hs_meeting_outcome?: string;
    hs_meeting_start_time?: string;
    hs_created_by_user_id?: string;
    createdate?: string;
    hs_createdate?: string;
    [key: string]: string | undefined;
  };
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

// Limitador global da Search API (~4 req/s). Reserva um "slot" de 250ms por
// busca via timestamp compartilhado, permitindo concorrência (a latência de uma
// busca é escondida enquanto outra é disparada) sem estourar o limite → evita
// 429. Usado só nas buscas pesadas de carteira/contatos.
let _nextSearchSlot = 0;
async function hsSearchPaced<T>(path: string, body: unknown): Promise<T> {
  const now = Date.now();
  const start = Math.max(now, _nextSearchSlot);
  _nextSearchSlot = start + 300; // ~3.3/s — folga sob o limite ~4/s da Search API
  const wait = start - now;
  if (wait > 0) await sleep(wait);
  return hsFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

// ============================================================
// Owners
// ============================================================

type OwnersResponse = { results: Owner[]; paging?: { next?: { after: string } } };

export async function fetchAllOwners(): Promise<Map<string, Owner>> {
  const map = new Map<string, Owner>();
  // Inclui ATIVOS e ARQUIVADOS: farmers cujo usuário foi excluído do HubSpot
  // ficam arquivados, mas os negócios deles continuam apontando pro ownerId —
  // sem isso, as demandas somem do painel (ex.: Priscila Dornelles Dias).
  for (const archived of ["false", "true"]) {
    let after: string | undefined;
    do {
      const qs = new URLSearchParams({ limit: "100", archived });
      if (after) qs.set("after", after);
      const data: OwnersResponse = await hsFetch(`/crm/v3/owners?${qs}`);
      for (const o of data.results) if (!map.has(o.id)) map.set(o.id, o);
      after = data.paging?.next?.after;
    } while (after);
  }
  return map;
}

export function ownerDisplayName(owner?: Owner): string {
  if (!owner) return "Desconhecido";
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
  "createdate",
  "closedate",
  "sdrfarmer_responsavel",
  "hubspot_owner_id",
  "pipedrive___data_de_qualificacao",
  "origem_do_lead",
  "origem_da_qualificacao",
  "valor_total_do_contrato__bruto___ganho_",
  "closed_lost_reason",
  "motivo_de_sinalizacao_de_perda",
  "pontuacao_leadscore",
  "criterios_atendidos",
];

// Origens do lead consideradas no painel. Valores internos EXATOS do HubSpot
// (confirmados em Settings → Properties → origem_do_lead).
// - "Carteira do Farmer" (label "Carteira")
// - "Ação de CRM"
export const ORIGEM_CARTEIRA = "Carteira do Farmer";
export const ORIGEM_ACAO_CRM = "Ação de CRM";
export const ORIGEM_ACAO_CRM_CARTEIRA = "Ação de CRM (Carteira)"; // valor novo — balde próprio
export const ORIGEM_INDICACAO = "Indicação";
export const ORIGEM_PALESTRANTE = "Palestrante";
// Valor da propriedade "Origem da qualificação" que TAMBÉM conta como Carteira.
// (essa propriedade não tem opção "Carteira"; o equivalente é "Farmer".)
export const ORIGEM_QUALIF_CARTEIRA = "Farmer";
const DEFAULT_ORIGINS = [ORIGEM_CARTEIRA, ORIGEM_ACAO_CRM, ORIGEM_ACAO_CRM_CARTEIRA];

// ----- Helpers de timezone (Brasília = UTC-3, sem DST desde 2019) -----
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const brStartOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS;
const brEndOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + BR_OFFSET_MS + 86_400_000 - 1;

// Campos DATE (sem hora) usam limites em UTC puro: o HubSpot guarda meia-noite
// UTC representando o dia-calendário; aplicar offset excluiria o 1º dia.
const utcStartOfDayMs = (yyyymmdd: string): number => new Date(yyyymmdd).getTime();
const utcEndOfDayMs = (yyyymmdd: string): number =>
  new Date(yyyymmdd).getTime() + 86_400_000 - 1;

type DealDateField = "pipedrive___data_de_qualificacao" | "closedate";

async function fetchDealsByDateField(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
  dateField: DealDateField;
  stages?: string[];
  /** Valores aceitos em `origem_do_lead`. */
  origemLeadValues?: string[];
  /** Valores aceitos em `origem_da_qualificacao` (OR com o lead). */
  origemQualValues?: string[];
}): Promise<Deal[]> {
  const { from, to, ownerIds, dateField, stages, origemLeadValues, origemQualValues } = opts;

  // "data_de_qualificacao" é campo DATE (sem hora) → limites em UTC puro.
  // "closedate" é datetime real → mantém o ajuste de fuso BRT.
  const isDateOnly = dateField === "pipedrive___data_de_qualificacao";

  // Filtros AND compartilhados por TODOS os grupos (data + estágio). O filtro de
  // responsável NÃO é compartilhado: no grupo de qualificação a atribuição é
  // pelo Proprietário da empresa, então não filtramos por sdrfarmer lá.
  const sharedFilters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }> = [
    { propertyName: dateField, operator: "HAS_PROPERTY" },
  ];
  if (stages && stages.length > 0) {
    sharedFilters.push({ propertyName: "dealstage", operator: "IN", values: stages });
  }
  if (from) {
    sharedFilters.push({
      propertyName: dateField,
      operator: "GTE",
      value: (isDateOnly ? utcStartOfDayMs(from) : brStartOfDayMs(from)).toString(),
    });
  }
  if (to) {
    sharedFilters.push({
      propertyName: dateField,
      operator: "LTE",
      value: (isDateOnly ? utcEndOfDayMs(to) : brEndOfDayMs(to)).toString(),
    });
  }

  const ownerFilter: Record<string, unknown> =
    ownerIds && ownerIds.length > 0
      ? { propertyName: "sdrfarmer_responsavel", operator: "IN", values: ownerIds.slice(0, 100) }
      : { propertyName: "sdrfarmer_responsavel", operator: "HAS_PROPERTY" };

  // Um grupo por condição de origem (grupos são OR entre si; HubSpot deduplica).
  // - Grupo de LEAD: origem_do_lead IN <leadValues> + filtro de responsável (SDR/Farmer).
  // - Grupo de QUALIF: origem_da_qualificacao IN <qualValues> SEM filtro de responsável
  //   (atribuição por Proprietário da empresa é resolvida depois, no agregador).
  const filterGroups: Array<{ filters: Array<Record<string, unknown>> }> = [];
  if (origemLeadValues && origemLeadValues.length > 0) {
    filterGroups.push({
      filters: [...sharedFilters, ownerFilter, { propertyName: "origem_do_lead", operator: "IN", values: origemLeadValues }],
    });
  }
  if (origemQualValues && origemQualValues.length > 0) {
    filterGroups.push({
      filters: [...sharedFilters, { propertyName: "origem_da_qualificacao", operator: "IN", values: origemQualValues }],
    });
  }
  // Fallback de segurança: sem nenhuma condição de origem, usa as origens padrão.
  if (filterGroups.length === 0) {
    filterGroups.push({
      filters: [...sharedFilters, ownerFilter, { propertyName: "origem_do_lead", operator: "IN", values: DEFAULT_ORIGINS }],
    });
  }

  const all: Deal[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups,
      properties: DEAL_PROPS,
      limit: 100,
      sorts: [{ propertyName: dateField, direction: "DESCENDING" }],
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

/** Deals QUALIFICADOS no período. Alimenta Demandas. */
export function fetchDealsByQualification(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
  origemLeadValues?: string[];
  origemQualValues?: string[];
}): Promise<Deal[]> {
  return fetchDealsByDateField({ ...opts, dateField: "pipedrive___data_de_qualificacao" });
}

/**
 * Deals FECHADOS no período (ganhos + perdidos). Alimenta Negócios fechados,
 * Receita e Perdidos. Restringe aos estágios finais por segurança — todo deal
 * com closedate está em estado final, mas filtrar é mais defensivo.
 */
export function fetchDealsByClose(opts: {
  from?: string;
  to?: string;
  ownerIds?: string[];
  origemLeadValues?: string[];
  origemQualValues?: string[];
}): Promise<Deal[]> {
  return fetchDealsByDateField({
    ...opts,
    dateField: "closedate",
    stages: [...GANHO_STAGES, STAGE_PERDIDO],
  });
}

// ============================================================
// Tickets (pipeline CS) — tramitações em andamento (snapshot ao vivo)
// ============================================================

const TICKET_PROPS = ["subject", "hubspot_owner_id", "hs_pipeline", "hs_pipeline_stage", "createdate"];

const STAGES_ABERTOS_ENV = process.env.HUBSPOT_PIPELINE_CS_STAGES_ABERTOS || "";

// Cache em memória dos estágios "em andamento" (TTL 1h). Estágios mudam
// raramente; cachear elimina chamadas extras à API.
let abertosCache: { value: string[]; expiresAt: number } | null = null;
const STAGES_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Resolve os IDs das etapas que contam como "tramitação em andamento":
 * "Em andamento" + "Iniciar Trâmites" dentro da pipeline CS. ENV tem
 * prioridade; sem ENV, casa pelo label da etapa.
 */
async function resolveAbertos(): Promise<string[]> {
  if (!PIPELINE_CS) return [];

  if (STAGES_ABERTOS_ENV) {
    return STAGES_ABERTOS_ENV.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const now = Date.now();
  if (abertosCache && abertosCache.expiresAt > now) return abertosCache.value;

  type Stage = { id: string; label: string };
  type PipelineResponse = { stages: Stage[] };
  const data: PipelineResponse = await hsFetch(
    `/crm/v3/pipelines/tickets/${encodeURIComponent(PIPELINE_CS)}`
  );

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const abertos = data.stages
    .filter((s) => {
      const n = norm(s.label);
      return n === "em andamento" || n === "iniciar tramites";
    })
    .map((s) => s.id);

  abertosCache = { value: abertos, expiresAt: now + STAGES_CACHE_TTL_MS };
  return abertos;
}

/**
 * Tickets nas etapas "Em andamento" / "Iniciar Trâmites" da pipeline CS.
 *
 * - Sem `from`/`to`: SNAPSHOT ao vivo (backlog atual), igual ao psa-farmer.
 * - Com `from`/`to`: filtra por `createdate` no período → tramitações CRIADAS
 *   no mês que estão nessas etapas.
 *
 * Retorna [] se HUBSPOT_PIPELINE_CS não estiver configurado.
 */
async function fetchCsTicketsEmEtapas(opts?: {
  ownerIds?: string[];
  from?: string;
  to?: string;
}): Promise<Ticket[]> {
  if (!PIPELINE_CS) return [];

  const abertos = await resolveAbertos();
  if (abertos.length === 0) {
    console.warn("[hubspot] Pipeline CS sem etapas 'em andamento' resolvidas");
    return [];
  }

  const ownerFilter =
    opts?.ownerIds && opts.ownerIds.length > 0
      ? { propertyName: "hubspot_owner_id", operator: "IN", values: opts.ownerIds.slice(0, 100) }
      : { propertyName: "hubspot_owner_id", operator: "HAS_PROPERTY" };

  const filters: Array<Record<string, unknown>> = [
    { propertyName: "hs_pipeline", operator: "EQ", value: PIPELINE_CS },
    { propertyName: "hs_pipeline_stage", operator: "IN", values: abertos },
    ownerFilter,
  ];

  // createdate é datetime real → usa limites em fuso de Brasília (igual closedate).
  if (opts?.from) {
    filters.push({ propertyName: "createdate", operator: "GTE", value: brStartOfDayMs(opts.from).toString() });
  }
  if (opts?.to) {
    filters.push({ propertyName: "createdate", operator: "LTE", value: brEndOfDayMs(opts.to).toString() });
  }

  const all: Ticket[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: TICKET_PROPS,
      limit: 100,
    };
    if (after) body.after = after;

    const data: SearchResponse<Ticket> = await hsFetch(`/crm/v3/objects/tickets/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    all.push(...data.results);
    after = data.paging?.next?.after;
    if (after) await sleep(150);
  } while (after);

  return all;
}

/** Snapshot ao vivo: tickets que ESTÃO hoje em "Em andamento"/"Iniciar Trâmites". */
export function fetchCsTramitacoesEmAndamento(opts?: { ownerIds?: string[] }): Promise<Ticket[]> {
  return fetchCsTicketsEmEtapas({ ownerIds: opts?.ownerIds });
}

/** Tramitações nessas etapas CRIADAS no período (filtra por createdate). */
export function fetchCsTramitacoesCriadas(opts: {
  ownerIds?: string[];
  from?: string;
  to?: string;
}): Promise<Ticket[]> {
  return fetchCsTicketsEmEtapas(opts);
}

export const PIPELINE_CS_ATIVO = !!PIPELINE_CS;

// ============================================================
// Reuniões (Meetings) — agendadas vs realizadas
// ============================================================
//
// Métrica: reuniões CRIADAS pelo farmer (hs_created_by_user_id) no período,
// associadas a um negócio na pipeline B2B. "Realizada" = resultado da reunião
// igual ao valor configurado (default "COMPLETED").
//
// Os nomes de propriedade e o valor de "realizada" são configuráveis por ENV
// porque variam de portal pra portal (e o acesso da IA a engajamento é
// bloqueado, então não dá pra introspectar — ajuste aqui se necessário).

const PIPELINE_B2B = process.env.HUBSPOT_PIPELINE_B2B || "default";
const MEETING_OUTCOME_FIELD = process.env.HUBSPOT_MEETING_OUTCOME_FIELD || "hs_meeting_outcome";
// Valor (ou valores, separados por vírgula) do resultado que conta como "realizada".
const MEETING_OUTCOME_REALIZADA = (process.env.HUBSPOT_MEETING_OUTCOME_REALIZADA || "COMPLETED")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Status de reunião por negócio, via associação CRM Deal → Meeting (v4):
 *  - agendada: o negócio tem ≥1 reunião associada (qualquer outcome)
 *  - realizada: ≥1 dessas reuniões tem hs_meeting_outcome = COMPLETED
 * Negócios sem reunião associada ficam FORA do map.
 */
export async function fetchDealMeetingStatus(
  dealIds: string[]
): Promise<Map<string, { agendada: boolean; realizada: boolean }>> {
  const out = new Map<string, { agendada: boolean; realizada: boolean }>();
  if (dealIds.length === 0) return out;

  // 1) deal → meetings
  const dealToMeetings = new Map<string, string[]>();
  const allMeetingIds = new Set<string>();
  for (const ids of chunk(dealIds, 100)) {
    const data = await hsFetch<{ results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: string | number }> }> }>(
      `/crm/v4/associations/deals/meetings/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
    );
    for (const r of data.results ?? []) {
      const from = String(r.from?.id ?? "");
      if (!from) continue;
      const ms = (r.to ?? []).map((t) => String(t.toObjectId ?? "")).filter(Boolean);
      if (ms.length === 0) continue;
      dealToMeetings.set(from, ms);
      ms.forEach((m) => allMeetingIds.add(m));
    }
    await sleep(150);
  }
  if (allMeetingIds.size === 0) return out;

  // 2) meeting → outcome (marca as COMPLETED)
  const completed = new Set<string>();
  for (const ids of chunk([...allMeetingIds], 100)) {
    const data = await hsFetch<{ results?: Array<{ id: string; properties?: Record<string, string> }> }>(
      `/crm/v3/objects/meetings/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: [MEETING_OUTCOME_FIELD] }) }
    );
    for (const m of data.results ?? []) {
      const o = (m.properties?.[MEETING_OUTCOME_FIELD] || "").toUpperCase();
      if (MEETING_OUTCOME_REALIZADA.includes(o)) completed.add(String(m.id));
    }
    await sleep(150);
  }

  // 3) por negócio: agendada sempre; realizada se alguma reunião é COMPLETED
  for (const [dealId, ms] of dealToMeetings) {
    out.set(dealId, { agendada: true, realizada: ms.some((m) => completed.has(m)) });
  }
  return out;
}

// ============================================================
// Proprietário da empresa associada a um negócio
// ============================================================
//
// Usado na atribuição especial dos negócios de "Qualificação Farmer": o
// crédito vai pro dono da empresa (hubspot_owner_id da company), não pro
// SDR/Farmer Responsável do negócio. Retorna Map<dealId, ownerId da empresa>.
// Deals sem empresa ou cuja empresa não tem dono ficam FORA do map.
/** dealId → companyId (1ª empresa associada). Base do "empresas únicas". */
export async function fetchDealCompanyIds(dealIds: string[]): Promise<Map<string, string>> {
  const dealToCompany = new Map<string, string>();
  if (dealIds.length === 0) return dealToCompany;
  for (const ids of chunk(dealIds, 100)) {
    const data = await hsFetch<{ results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: string | number }> }> }>(
      `/crm/v4/associations/deals/companies/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
    );
    for (const r of data.results ?? []) {
      const from = String(r.from?.id ?? "");
      const first = r.to?.[0]?.toObjectId;
      if (from && first != null) dealToCompany.set(from, String(first));
    }
    await sleep(150);
  }
  return dealToCompany;
}

/** companyId → nome da empresa (pro modal de empresas únicas). */
export async function fetchCompanyNames(companyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (companyIds.length === 0) return out;
  for (const ids of chunk(companyIds, 100)) {
    const data = await hsFetch<{ results?: Array<{ id: string; properties?: { name?: string } }> }>(
      `/crm/v3/objects/companies/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ["name"] }) }
    );
    for (const c of data.results ?? []) out.set(String(c.id), c.properties?.name || "");
    await sleep(150);
  }
  return out;
}

// ============================================================
// Perfil completo do tomador de decisão (carteira dos farmers)
// ============================================================
//
// Carteira = empresas com status_da_empresa "Carteirizada" cujo Proprietário
// (hubspot_owner_id) é um farmer do painel. Uma empresa conta como "perfil
// completo" quando tem >=1 contato associado que é Tomador de Decisão com
// Nome, Telefone, E-mail e LinkedIn preenchidos.
//
// Estratégia (carteira do time ~6k empresas): 1) monta o conjunto GLOBAL de
// contatos "tomador de decisão completos" (ids); 2) por owner (em paralelo),
// enumera a carteira e, via associação COMPLETA empresa→contatos (v4, todas as
// associações, não só a primária), marca a empresa como completa se algum
// contato associado está no conjunto. Objeto simples (serializável p/ cache).
export type CarteiraPerfil = Record<string, { carteira: number; completo: number }>;

// Todos os contatos que são Tomador de Decisão COMPLETOS (Nome, Telefone,
// E-mail e LinkedIn preenchidos). Retorna o Set de ids.
//
// Particionado por faixas de createdate, rodando EM PARALELO — todas as buscas
// passam pelo limitador global (hsSearchPaced) de 4/s, então a concorrência
// esconde a latência sem estourar o rate limit. O filtro de firstname sai do
// server (não cabe com o range: máx 6 filtros/grupo) e é verificado em código.
async function fetchContatosDmCompletos(): Promise<Set<string>> {
  const ids = new Set<string>();
  const bounds: number[] = [];
  for (let y = 2024; y <= 2027; y++) {
    for (let m = 0; m < 12; m += 3) {
      bounds.push(Date.parse(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`));
    }
  }
  const buckets: Array<{ gte?: number; lt?: number }> = [{ lt: bounds[0] }];
  for (let i = 0; i < bounds.length - 1; i++) buckets.push({ gte: bounds[i], lt: bounds[i + 1] });
  buckets.push({ gte: bounds[bounds.length - 1] });

  const base = [
    { propertyName: "hs_buying_role", operator: "EQ", value: "DECISION_MAKER" },
    { propertyName: "phone", operator: "HAS_PROPERTY" },
    { propertyName: "email", operator: "HAS_PROPERTY" },
    { propertyName: "linkedin", operator: "HAS_PROPERTY" },
  ];
  await Promise.all(buckets.map(async (b) => {
    const filters: Array<Record<string, unknown>> = [...base];
    if (b.gte != null) filters.push({ propertyName: "createdate", operator: "GTE", value: String(b.gte) });
    if (b.lt != null) filters.push({ propertyName: "createdate", operator: "LT", value: String(b.lt) });
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = { filterGroups: [{ filters }], properties: ["firstname"], limit: 100 };
      if (after) body.after = after;
      const data: SearchResponse<{ id: string; properties: { firstname?: string } }> = await hsSearchPaced(
        `/crm/v3/objects/contacts/search`,
        body
      );
      for (const c of data.results) {
        if ((c.properties?.firstname ?? "").trim() !== "") ids.add(String(c.id));
      }
      after = data.paging?.next?.after;
    } while (after);
  }));
  return ids;
}

// Empresas associadas aos contatos DM completos (TODAS as associações, via v4
// contacts→companies). Payloads pequenos (contato tem 1–3 empresas) → rápido.
async function fetchEmpresasComDmCompleto(contatoIds: string[]): Promise<Set<string>> {
  const empresas = new Set<string>();
  const lotes = chunk(contatoIds, 100);
  const CONC = 5;
  for (let i = 0; i < lotes.length; i += CONC) {
    await Promise.all(
      lotes.slice(i, i + CONC).map(async (ids) => {
        const data = await hsFetch<{ results?: Array<{ to?: Array<{ toObjectId?: string | number }> }> }>(
          `/crm/v4/associations/contacts/companies/batch/read`,
          { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
        );
        for (const r of data.results ?? []) {
          for (const t of r.to ?? []) if (t.toObjectId != null) empresas.add(String(t.toObjectId));
        }
      })
    );
    await sleep(30);
  }
  return empresas;
}

// Total da carteira de UM farmer (só a contagem — 1 busca paced, lê o `total`).
async function carteiraTotalDoOwner(ownerId: string): Promise<number> {
  const body = {
    filterGroups: [{ filters: [
      { propertyName: "status_da_empresa", operator: "EQ", value: "Carteirizada" },
      { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
    ] }],
    properties: ["hubspot_owner_id"],
    limit: 1,
  };
  const data: SearchResponse<{ id: string }> = await hsSearchPaced(`/crm/v3/objects/companies/search`, body);
  return data.total ?? 0;
}

// Conjunto GLOBAL de empresas que têm ≥1 contato Tomador de Decisão completo.
// É a parte pesada (varredura dos ~6k contatos DM completos + associações) e
// muda devagar → cacheada à parte no route (12h) e reutilizada pelas contagens.
export async function fetchEmpresasComDm(): Promise<string[]> {
  const dmCompletos = await fetchContatosDmCompletos();
  const empresas = await fetchEmpresasComDmCompleto([...dmCompletos]);
  return [...empresas];
}

// Contagens da carteira por farmer, dado o conjunto de empresas com DM completo:
//  - carteiraTotal: 1 busca de contagem por owner (concorrentes, limitador 4/s).
//  - completo: batch-read (não-search) das empresas com DM → credita quando
//    Carteirizada + dono do time.
export async function fetchCarteiraCounts(ownerIds: string[], empresasComDm: Set<string>): Promise<CarteiraPerfil> {
  const out: CarteiraPerfil = {};
  for (const id of ownerIds) out[id] = { carteira: 0, completo: 0 };
  if (ownerIds.length === 0) return out;

  await Promise.all(ownerIds.map(async (oid) => { out[oid].carteira = await carteiraTotalDoOwner(oid); }));

  const teamSet = new Set(ownerIds);
  const lotes = chunk([...empresasComDm], 100);
  const CONC_READ = 5;
  for (let i = 0; i < lotes.length; i += CONC_READ) {
    await Promise.all(
      lotes.slice(i, i + CONC_READ).map(async (ids) => {
        const data = await hsFetch<{ results?: Array<{ id: string; properties?: { hubspot_owner_id?: string; status_da_empresa?: string } }> }>(
          `/crm/v3/objects/companies/batch/read`,
          { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ["hubspot_owner_id", "status_da_empresa"] }) }
        );
        for (const co of data.results ?? []) {
          const oid = co.properties?.hubspot_owner_id;
          if (co.properties?.status_da_empresa === "Carteirizada" && oid && teamSet.has(oid)) {
            out[oid].completo += 1;
          }
        }
      })
    );
    await sleep(30);
  }
  return out;
}

// ------------------------------------------------------------
// Detalhe da carteira de UM farmer (sob demanda, ao clicar no card).
// Lista as empresas Carteirizada + status do perfil do tomador de decisão e,
// quando incompleto, QUAIS campos faltam. Escopo de 1 farmer (~300 empresas) →
// leve o bastante pra rodar on-demand. Cacheado por owner no route.
// ------------------------------------------------------------
export type CarteiraEmpresa = { name: string; completo: boolean; missing: string[] };

export async function fetchCarteiraDetalheOwner(ownerId: string): Promise<CarteiraEmpresa[]> {
  // 1) empresas da carteira + nomes
  const empresas: Array<{ id: string; name: string }> = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [
        { propertyName: "status_da_empresa", operator: "EQ", value: "Carteirizada" },
        { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
      ] }],
      properties: ["name"],
      limit: 100,
    };
    if (after) body.after = after;
    const data: SearchResponse<{ id: string; properties: { name?: string } }> = await hsSearchPaced(
      `/crm/v3/objects/companies/search`,
      body
    );
    for (const c of data.results) empresas.push({ id: String(c.id), name: c.properties?.name || "(sem nome)" });
    after = data.paging?.next?.after;
  } while (after);
  if (empresas.length === 0) return [];

  // 2) contatos associados (todas as associações) de cada empresa
  const compToContacts = new Map<string, string[]>();
  const allContacts = new Set<string>();
  for (const ids of chunk(empresas.map((e) => e.id), 100)) {
    const data = await hsFetch<{ results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: string | number }> }> }>(
      `/crm/v4/associations/companies/contacts/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
    );
    for (const r of data.results ?? []) {
      const from = String(r.from?.id ?? "");
      if (!from) continue;
      const to = (r.to ?? []).map((t) => String(t.toObjectId ?? "")).filter(Boolean);
      compToContacts.set(from, to);
      to.forEach((c) => allContacts.add(c));
    }
    await sleep(30);
  }

  // 3) campos dos contatos (batch-read, não-search)
  const cprops = new Map<string, Record<string, string | undefined>>();
  for (const ids of chunk([...allContacts], 100)) {
    const data = await hsFetch<{ results?: Array<{ id: string; properties?: Record<string, string> }> }>(
      `/crm/v3/objects/contacts/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ["firstname", "phone", "email", "linkedin", "hs_buying_role"] }) }
    );
    for (const c of data.results ?? []) cprops.set(String(c.id), c.properties ?? {});
    await sleep(30);
  }

  // 4) status por empresa: melhor contato Tomador de Decisão (menos campos
  //    faltando); sem DM → "Tomador de Decisão" falta como um todo.
  const FIELDS: Array<[string, string]> = [["firstname", "Nome"], ["phone", "Telefone"], ["email", "E-mail"], ["linkedin", "LinkedIn"]];
  const has = (v?: string) => v != null && String(v).trim() !== "";
  const out: CarteiraEmpresa[] = empresas.map((e) => {
    const contatos = (compToContacts.get(e.id) ?? []).map((id) => cprops.get(id)).filter((p): p is Record<string, string | undefined> => !!p);
    const dm = contatos.filter((p) => p.hs_buying_role === "DECISION_MAKER");
    if (dm.length === 0) return { name: e.name, completo: false, missing: ["Tomador de Decisão"] };
    let best: string[] | null = null;
    for (const p of dm) {
      const missing = FIELDS.filter(([k]) => !has(p[k])).map(([, label]) => label);
      if (best === null || missing.length < best.length) best = missing;
      if (missing.length === 0) break;
    }
    return { name: e.name, completo: (best ?? []).length === 0, missing: best ?? [] };
  });
  out.sort((a, b) => Number(a.completo) - Number(b.completo) || a.name.localeCompare(b.name, "pt-BR"));
  return out;
}

export async function fetchCompanyOwnersForDeals(dealIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (dealIds.length === 0) return result;

  // 1) associações deal → company (usa a 1ª empresa associada)
  const dealToCompany = new Map<string, string>();
  const allCompanyIds = new Set<string>();
  for (const ids of chunk(dealIds, 100)) {
    const data = await hsFetch<{ results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: string | number }> }> }>(
      `/crm/v4/associations/deals/companies/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }) }
    );
    for (const r of data.results ?? []) {
      const from = String(r.from?.id ?? "");
      const first = r.to?.[0]?.toObjectId;
      if (from && first != null) {
        dealToCompany.set(from, String(first));
        allCompanyIds.add(String(first));
      }
    }
    await sleep(150);
  }
  if (allCompanyIds.size === 0) return result;

  // 2) dono (hubspot_owner_id) de cada empresa
  const companyOwner = new Map<string, string>();
  for (const ids of chunk([...allCompanyIds], 100)) {
    const data = await hsFetch<{ results?: Array<{ id: string; properties?: { hubspot_owner_id?: string } }> }>(
      `/crm/v3/objects/companies/batch/read`,
      { method: "POST", body: JSON.stringify({ inputs: ids.map((id) => ({ id })), properties: ["hubspot_owner_id"] }) }
    );
    for (const c of data.results ?? []) {
      const owner = c.properties?.hubspot_owner_id;
      if (owner) companyOwner.set(String(c.id), String(owner));
    }
    await sleep(150);
  }

  for (const [dealId, companyId] of dealToCompany) {
    const owner = companyOwner.get(companyId);
    if (owner) result.set(dealId, owner);
  }
  return result;
}

// ============================================================
// Etapas (dealstage) das pipelines de negócio — para o gráfico por etapa
// ============================================================
//
// Retorna: labelById (id da etapa → rótulo legível, de TODAS as pipelines) e
// `ordered` (etapas da pipeline B2B na ordem do funil, pro gráfico).
type DealStageLite = { id: string; label: string };
let dealStagesCache: { labelById: Map<string, string>; ordered: DealStageLite[]; expiresAt: number } | null = null;

export async function getDealStages(): Promise<{ labelById: Map<string, string>; ordered: DealStageLite[] }> {
  const now = Date.now();
  if (dealStagesCache && dealStagesCache.expiresAt > now) return dealStagesCache;

  const data = await hsFetch<{
    results?: Array<{ id: string; stages?: Array<{ id: string; label: string; displayOrder?: number }> }>;
  }>(`/crm/v3/pipelines/deals`);

  const labelById = new Map<string, string>();
  let ordered: DealStageLite[] = [];
  for (const p of data.results ?? []) {
    for (const s of p.stages ?? []) labelById.set(s.id, s.label);
    if (p.id === PIPELINE_B2B) {
      ordered = [...(p.stages ?? [])]
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s) => ({ id: s.id, label: s.label }));
    }
  }
  dealStagesCache = { labelById, ordered, expiresAt: now + 60 * 60 * 1000 };
  return { labelById, ordered };
}
