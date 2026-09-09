// ============================================================
// Vendas do Dia — ganhos do segmento agrupados por dia pela DATA DE FECHAMENTO
// ATUAL do negócio (a que aparece no HubSpot). Vendas que "caíram" (saíram do
// ganho) ficam sinalizadas, não somem.
// ============================================================

import { hsFetch, sleep, dealUrl, ownerDisplayName, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const startOf = (from?: string) => (from ? new Date(from).getTime() + BR_OFFSET_MS : Date.now() - 30 * 86_400_000);
const endOf = (to?: string) => (to ? new Date(to).getTime() + BR_OFFSET_MS + 86_400_000 - 1 : Date.now());
const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && v.length >= 10) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};
const dayKey = (ms: number): string => {
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export type VendaItem = {
  seg: "b2b" | "b2c";
  status: "ganho" | "caiu";
  currentStage?: string; // etapa atual quando caiu (ex.: "Perdido")
  // Bruto por segmento: B2B = valor_total_do_contrato (ganho), B2C = valor_bruto.
  // Líquido = amount nos dois. Sem bruto preenchido → bruto = amount (valor único).
  bruto: number;
  liquido: number;
  closer: string;
  dealname: string;
  url: string;
  sdrFarmer?: string;
  evento?: string;
  palestrante?: string; // só B2B (palestrante vendido)
  produto?: string;
  turma?: string;
};
export type VendaDia = { key: string; count: number; total: number; totalLiq: number; vendas: VendaItem[] };
export type VendasDoDiaData = { dias: VendaDia[]; total: number; totalLiq: number; count: number };

export async function fetchVendasDoDia(config: SegmentConfig, opts: { from?: string; to?: string }, owners: Map<string, Owner>): Promise<VendasDoDiaData> {
  const startMs = startOf(opts.from);
  const endMs = endOf(opts.to);
  const pipe = config.id === "b2c" ? "725182862" : "default";
  const wonSet = new Set(config.wonStageIds);

  // Mapa etapa → rótulo (pra mostrar onde a venda foi parar quando cai).
  const stageLabel = new Map<string, string>();
  config.stages.forEach((s) => stageLabel.set(s.id, s.label));
  config.lostStageIds.forEach((id) => stageLabel.set(id, "Perdido"));
  config.wonStageIds.forEach((id) => stageLabel.set(id, "Ganho"));

  const props = [
    "dealname", "amount", "valor_total_do_contrato__bruto___ganho_", "valor_bruto",
    "hubspot_owner_id", "closedate", "dealstage",
    "sdrfarmer_responsavel", "data_prevista_do_evento", "palestrante_principal_correta",
    "produto_de_interesse", "turma_the_best_weekend_", "turma_the_best_weekend", "turma_tbw_s",
  ];
  // Candidatos: negócios que ENTRARAM em alguma etapa de ganho (won-stamp existe
  // → ganhos + os que "caíram") E cuja DATA DE FECHAMENTO atual cai no período.
  // OR entre as etapas de ganho. O dia da venda = closedate atual (ver loop).
  const filterGroups = config.wonStageIds.map((sid) => ({
    filters: [
      { propertyName: "pipeline", operator: "EQ", value: pipe },
      { propertyName: `hs_v2_date_entered_${sid}`, operator: "HAS_PROPERTY" },
      { propertyName: "closedate", operator: "GTE", value: String(startMs) },
      { propertyName: "closedate", operator: "LTE", value: String(endMs) },
    ],
  }));

  const rawById = new Map<string, { id: string; properties: Record<string, string> }>();
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups, properties: props, sorts: [{ propertyName: "closedate", direction: "DESCENDING" }], limit: 200 };
    if (after) body.after = after;
    const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/deals/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    for (const d of data.results ?? []) rawById.set(d.id, d); // dedup (grupos OR podem repetir)
    after = data.paging?.next?.after;
    if (after) await sleep(120);
  } while (after && rawById.size < 9800);
  const raw = [...rawById.values()];

  const name = (id?: string) => (id ? ownerDisplayName(owners.get(id)) : "");
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const seg: "b2b" | "b2c" = config.id === "b2c" ? "b2c" : "b2b";

  // Palestrante vendido (só B2B): mapeia o valor do enum (slug) pro nome legível.
  // Alguns labels vêm como slug no HubSpot ("rachel-maia") — prettifica pra "Rachel Maia".
  const prettyPal = (raw: string): string => {
    const label = raw.replace(/\s+/g, " ").trim();
    if (!label || label.includes(" ") || !label.includes("-")) return label; // já legível
    const parts = label.split("-").filter(Boolean);
    if (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop(); // dropa sufixo id/hash
    return parts.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  };
  const palMap = new Map<string, string>();
  if (seg === "b2b") {
    const pj = await hsFetch<{ options?: { value: string; label: string; hidden?: boolean }[] }>(
      "/crm/v3/properties/deals/palestrante_principal_correta"
    );
    for (const o of pj.options ?? []) if (!o.hidden) palMap.set(o.value, prettyPal((o.label || "").trim()));
  }

  const toItem = (id: string, p: Record<string, string>): { item: VendaItem; isWon: boolean; bruto: number; liquido: number } => {
    const amount = Number(p.amount) || 0;
    // Bruto por segmento: B2B usa "valor total do contrato (ganho)"; B2C usa
    // "valor_bruto". Líquido = "Valor" (amount) nos dois. Quando o bruto não vem
    // preenchido, bruto = amount → sem distinção (mostra só um valor).
    const brutoGanho = seg === "b2c"
      ? Number(p.valor_bruto) || 0
      : Number(p.valor_total_do_contrato__bruto___ganho_) || 0;
    const bruto = brutoGanho > 0 ? brutoGanho : amount;
    const liquido = amount;
    const isWon = wonSet.has(p.dealstage);
    return {
      bruto, liquido, isWon,
      item: {
        seg,
        status: isWon ? "ganho" : "caiu",
        currentStage: isWon ? undefined : (stageLabel.get(p.dealstage) || "Outra etapa"),
        bruto, liquido,
        closer: name(p.hubspot_owner_id) || "Sem closer",
        dealname: p.dealname || `Negócio ${id}`,
        url: dealUrl(id),
        sdrFarmer: clean(name(p.sdrfarmer_responsavel)),
        evento: clean(p.data_prevista_do_evento),
        palestrante: seg === "b2b" ? (palMap.get((p.palestrante_principal_correta || "").trim()) || undefined) : undefined,
        produto: clean(p.produto_de_interesse),
        turma: clean(p.turma_the_best_weekend_) || clean(p.turma_the_best_weekend) || clean(p.turma_tbw_s),
      },
    };
  };

  const byDay = new Map<string, VendaDia>();
  let total = 0;
  let totalLiq = 0;
  let count = 0;
  const push = (saleMs: number, id: string, p: Record<string, string>) => {
    const { item, isWon, bruto, liquido } = toItem(id, p);
    const k = dayKey(saleMs);
    let dia = byDay.get(k);
    if (!dia) { dia = { key: k, count: 0, total: 0, totalLiq: 0, vendas: [] }; byDay.set(k, dia); }
    dia.vendas.push(item);
    if (isWon) { dia.count += 1; dia.total += bruto; dia.totalLiq += liquido; total += bruto; totalLiq += liquido; count += 1; }
  };

  for (const d of raw) {
    // Dia da venda = Data de Fechamento ATUAL do negócio (a que aparece no HubSpot).
    const saleMs = toMs(d.properties.closedate);
    if (saleMs != null && saleMs >= startMs && saleMs <= endMs) push(saleMs, d.id, d.properties);
  }

  const dias = [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  // Dentro do dia: ganhos primeiro (valor bruto desc), depois as que caíram.
  dias.forEach((d) => d.vendas.sort((a, b) => (a.status === b.status ? b.bruto - a.bruto : a.status === "ganho" ? -1 : 1)));
  return { dias, total, totalLiq, count };
}
