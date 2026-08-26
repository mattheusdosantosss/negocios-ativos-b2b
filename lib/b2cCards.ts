// ============================================================
// Cards B2C: ganhos por atributo (7), lead time dos ganhos (8),
// conversão por closer (9). Live do HubSpot, seguem os filtros do topo.
// ============================================================

import { hsFetch, sleep, dealUrl } from "./hubspot";
import type { SegmentConfig } from "./segments";
import { PERFIS, TEMPERATURES } from "./aggregate";
import type { AggregatedDealItem } from "./aggregate";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const startOf = (from?: string) => (from ? new Date(from).getTime() + BR_OFFSET_MS : Date.now() - 183 * 86_400_000);
const endOf = (to?: string) => (to ? new Date(to).getTime() + BR_OFFSET_MS + 86_400_000 - 1 : Date.now());
const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && v.length >= 10) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

type Opts = { from?: string; to?: string; owner?: string; origem?: string[] };

// ---- tipos de saída ----
export type GanhoBucket = { id: string; label: string; count: number; deals: AggregatedDealItem[] };
export type GanhosAtributosData = {
  total: number;
  porPerfil: GanhoBucket[];
  porTemperatura: GanhoBucket[];
  porLeadScore: GanhoBucket[];
  cobertura: { perfil: number; temperatura: number; leadScore: number };
};
export type LeadTimeFaixa = { id: string; label: string; count: number; deals: AggregatedDealItem[] };
export type LeadTimeGanhosData = { total: number; comData: number; medianaDias: number; faixas: LeadTimeFaixa[] };
export type ConvCloserRow = { ownerId: string; nome: string; criados: number; ganhos: number; taxa: number };
export type ConvCloserData = { rows: ConvCloserRow[]; total: { criados: number; ganhos: number; taxa: number } };

// ---- faixas de lead score e de lead time ----
const LEADSCORE_FAIXAS = [
  { id: "0_25", label: "0–25", min: 0, max: 25 },
  { id: "26_50", label: "26–50", min: 26, max: 50 },
  { id: "51_75", label: "51–75", min: 51, max: 75 },
  { id: "76_100", label: "76–100", min: 76, max: Infinity },
];
const LEADTIME_FAIXAS = [
  { id: "0_7", label: "Até 7 dias", max: 7 },
  { id: "8_15", label: "8–15 dias", max: 15 },
  { id: "16_30", label: "16–30 dias", max: 30 },
  { id: "30_", label: "30+ dias", max: Infinity },
];

const perfilId = (raw?: string) => PERFIS.find((p) => p.raw && p.raw === (raw || "").trim())?.id ?? "sem_perfil";
const tempId = (raw?: string) => TEMPERATURES.find((t) => t.raw && t.raw === (raw || "").trim())?.id ?? "sem_leitura";

type GanhoDeal = {
  perfil: string;
  temp: string;
  score: number | null;
  qualMs: number | null;
  item: AggregatedDealItem;
};

// Busca os ganhos B2C no período (por closedate), com tudo que os cards 7 e 8
// precisam. Respeita origem e closer.
async function fetchGanhosB2C(config: SegmentConfig, opts: Opts, ownerName: Map<string, string>): Promise<GanhoDeal[]> {
  const startMs = startOf(opts.from);
  const endMs = endOf(opts.to);
  const filters: Array<Record<string, unknown>> = [
    { propertyName: "pipeline", operator: "EQ", value: config.id === "b2c" ? "725182862" : "default" },
    { propertyName: "dealstage", operator: "IN", values: config.wonStageIds },
    { propertyName: "closedate", operator: "GTE", value: String(startMs) },
    { propertyName: "closedate", operator: "LTE", value: String(endMs) },
  ];
  if (opts.owner) filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  if (opts.origem && opts.origem.length) filters.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });

  const props = ["perfil", "temperatura_atual", "pontuacao_leadscore", "pipedrive___data_de_qualificacao", "createdate", "closedate", "hubspot_owner_id", "dealname", "amount", "valor_liquido_b2c_10"];
  const out: GanhoDeal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties: props, limit: 100 };
    if (after) body.after = after;
    const data = await hsFetch<{ results?: { id: string; properties?: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/deals/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    for (const d of data.results ?? []) {
      const p = d.properties ?? {};
      const amount = Number(p.amount) || 0;
      const valorLiquido = Number(p.valor_liquido_b2c_10) || amount;
      const score = p.pontuacao_leadscore != null && String(p.pontuacao_leadscore).trim() !== "" ? Number(p.pontuacao_leadscore) : null;
      out.push({
        perfil: perfilId(p.perfil),
        temp: tempId(p.temperatura_atual),
        score: score != null && !Number.isNaN(score) ? score : null,
        qualMs: toMs(p.pipedrive___data_de_qualificacao),
        item: {
          id: String(d.id),
          dealname: p.dealname || `Negócio ${d.id}`,
          amount,
          valorLiquido,
          createdate: p.createdate,
          qualdate: p.pipedrive___data_de_qualificacao,
          closedate: p.closedate,
          url: dealUrl(String(d.id)),
          perfil: perfilId(p.perfil),
          temp: tempId(p.temperatura_atual),
          ownerName: ownerName.get(p.hubspot_owner_id || "") || "Sem closer",
        },
      });
    }
    after = data.paging?.next?.after;
    if (after) await sleep(120);
  } while (after);
  return out;
}

// ---- Item 7: ganhos por atributo ----
export async function fetchGanhosAtributos(config: SegmentConfig, opts: Opts, ownerName: Map<string, string>): Promise<GanhosAtributosData> {
  const ganhos = await fetchGanhosB2C(config, opts, ownerName);
  const total = ganhos.length;
  const empty = <T extends { id: string; label: string }>(defs: T[]): GanhoBucket[] => defs.map((d) => ({ id: d.id, label: d.label, count: 0, deals: [] }));

  const porPerfil = empty(PERFIS);
  const porTemperatura = empty(TEMPERATURES);
  const porLeadScore = [...LEADSCORE_FAIXAS.map((f) => ({ id: f.id, label: f.label })), { id: "sem_nota", label: "Sem nota" }].map((d) => ({ id: d.id, label: d.label, count: 0, deals: [] as AggregatedDealItem[] }));
  const push = (arr: GanhoBucket[], id: string, item: AggregatedDealItem) => {
    const b = arr.find((x) => x.id === id);
    if (b) { b.count++; b.deals.push(item); }
  };

  let comPerfil = 0, comTemp = 0, comScore = 0;
  for (const g of ganhos) {
    push(porPerfil, g.perfil, g.item);
    push(porTemperatura, g.temp, g.item);
    if (g.perfil !== "sem_perfil") comPerfil++;
    if (g.temp !== "sem_leitura") comTemp++;
    if (g.score != null) {
      comScore++;
      const faixa = LEADSCORE_FAIXAS.find((f) => g.score! >= f.min && g.score! <= f.max);
      push(porLeadScore, faixa?.id ?? "sem_nota", g.item);
    } else {
      push(porLeadScore, "sem_nota", g.item);
    }
  }
  return {
    total,
    porPerfil,
    porTemperatura,
    porLeadScore,
    cobertura: {
      perfil: total ? comPerfil / total : 0,
      temperatura: total ? comTemp / total : 0,
      leadScore: total ? comScore / total : 0,
    },
  };
}

// ---- Item 8: lead time dos ganhos (qualificação → ganho) ----
export async function fetchLeadTimeGanhos(config: SegmentConfig, opts: Opts, ownerName: Map<string, string>): Promise<LeadTimeGanhosData> {
  const ganhos = await fetchGanhosB2C(config, opts, ownerName);
  const faixas: LeadTimeFaixa[] = LEADTIME_FAIXAS.map((f) => ({ id: f.id, label: f.label, count: 0, deals: [] }));
  const dias: number[] = [];
  for (const g of ganhos) {
    const close = toMs(g.item.closedate);
    if (g.qualMs == null || close == null || close < g.qualMs) continue;
    const d = (close - g.qualMs) / 86_400_000;
    dias.push(d);
    const faixa = LEADTIME_FAIXAS.find((f) => d <= f.max)!;
    const b = faixas.find((x) => x.id === faixa.id)!;
    b.count++;
    b.deals.push(g.item);
  }
  dias.sort((a, b) => a - b);
  const mediana = dias.length ? dias[Math.floor(dias.length / 2)] : 0;
  return { total: ganhos.length, comData: dias.length, medianaDias: Math.round(mediana), faixas };
}

// ---- Item 9: conversão por closer (coorte por mês de criação) ----
export async function fetchConversaoPorCloser(config: SegmentConfig, opts: Opts): Promise<ConvCloserData> {
  const startMs = startOf(opts.from);
  const endMs = endOf(opts.to);
  const pipe = config.id === "b2c" ? "725182862" : "default";
  const baseFilters = (ownerId: string, won: boolean): Array<Record<string, unknown>> => {
    const f: Array<Record<string, unknown>> = [
      { propertyName: "pipeline", operator: "EQ", value: pipe },
      { propertyName: "hubspot_owner_id", operator: "EQ", value: ownerId },
      { propertyName: "createdate", operator: "GTE", value: String(startMs) },
      { propertyName: "createdate", operator: "LTE", value: String(endMs) },
    ];
    if (opts.origem && opts.origem.length) f.push({ propertyName: "origem_do_lead", operator: "IN", values: opts.origem });
    if (won) f.push({ propertyName: "dealstage", operator: "IN", values: config.wonStageIds });
    return f;
  };
  const count = async (f: Array<Record<string, unknown>>): Promise<number> => {
    const data = await hsFetch<{ total?: number }>(`/crm/v3/objects/deals/search`, { method: "POST", body: JSON.stringify({ filterGroups: [{ filters: f }], limit: 1 }) });
    return data.total ?? 0;
  };

  const rows: ConvCloserRow[] = [];
  for (const m of config.team) {
    const [criados, ganhos] = await Promise.all([count(baseFilters(m.ownerId, false)), count(baseFilters(m.ownerId, true))]);
    await sleep(80);
    if (criados === 0 && ganhos === 0) continue;
    rows.push({ ownerId: m.ownerId, nome: m.nome, criados, ganhos, taxa: criados > 0 ? ganhos / criados : 0 });
  }
  rows.sort((a, b) => b.criados - a.criados || a.nome.localeCompare(b.nome, "pt-BR"));
  const tc = rows.reduce((s, r) => s + r.criados, 0);
  const tg = rows.reduce((s, r) => s + r.ganhos, 0);
  return { rows, total: { criados: tc, ganhos: tg, taxa: tc > 0 ? tg / tc : 0 } };
}
