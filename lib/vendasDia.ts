// ============================================================
// Vendas do Dia — ganhos do segmento agrupados por dia (pela ENTRADA na etapa
// de ganho). Vendas que "caíram" (saíram do ganho) ficam sinalizadas, não somem.
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
  amount: number;
  closer: string;
  dealname: string;
  url: string;
  sdrFarmer?: string;
  evento?: string;
  palestrante?: string;
  produto?: string;
  turma?: string;
};
export type VendaDia = { key: string; count: number; total: number; vendas: VendaItem[] };
export type VendasDoDiaData = { dias: VendaDia[]; total: number; count: number };

// Override pontual: negócios cujo GANHO foi registrado no dia seguinte, mas que
// devem contar como venda do dia do FECHAMENTO (closedate). Entram sob a closedate,
// nunca sob a entrada real no ganho. (Ajuste manual pedido — remover quando não fizer sentido.)
const VENDA_DIA_OVERRIDE = new Set(["64338523747", "62028951388", "64410607418", "62738508899"]);

export async function fetchVendasDoDia(config: SegmentConfig, opts: { from?: string; to?: string }, owners: Map<string, Owner>): Promise<VendasDoDiaData> {
  const startMs = startOf(opts.from);
  const endMs = endOf(opts.to);
  const pipe = config.id === "b2c" ? "725182862" : "default";
  const wonSet = new Set(config.wonStageIds);
  const stampProp = `hs_v2_date_entered_${config.wonStageIds[0]}`; // entrada na etapa de ganho principal

  // Mapa etapa → rótulo (pra mostrar onde a venda foi parar quando cai).
  const stageLabel = new Map<string, string>();
  config.stages.forEach((s) => stageLabel.set(s.id, s.label));
  config.lostStageIds.forEach((id) => stageLabel.set(id, "Perdido"));
  config.wonStageIds.forEach((id) => stageLabel.set(id, "Ganho"));

  const props = [
    "dealname", "amount", "hubspot_owner_id", "closedate", "dealstage", stampProp,
    "sdrfarmer_responsavel", "data_prevista_do_evento",
    "palestrante_principal__ganho_", "palestrante_de_interesse",
    "produto_de_interesse", "turma_the_best_weekend_", "turma_the_best_weekend", "turma_tbw_s",
  ];
  // Entraram na etapa de GANHO no período (carimbo), qualquer etapa atual.
  const filters = [
    { propertyName: "pipeline", operator: "EQ", value: pipe },
    { propertyName: stampProp, operator: "GTE", value: String(startMs) },
    { propertyName: stampProp, operator: "LTE", value: String(endMs) },
  ];

  const raw: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties: props, sorts: [{ propertyName: stampProp, direction: "DESCENDING" }], limit: 200 };
    if (after) body.after = after;
    const data = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/deals/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    raw.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (after) await sleep(120);
  } while (after && raw.length < 9800);

  const name = (id?: string) => (id ? ownerDisplayName(owners.get(id)) : "");
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const seg: "b2b" | "b2c" = config.id === "b2c" ? "b2c" : "b2b";

  const toItem = (id: string, p: Record<string, string>): { item: VendaItem; isWon: boolean; amount: number } => {
    const amount = Number(p.amount) || 0;
    const isWon = wonSet.has(p.dealstage);
    return {
      amount, isWon,
      item: {
        seg,
        status: isWon ? "ganho" : "caiu",
        currentStage: isWon ? undefined : (stageLabel.get(p.dealstage) || "Outra etapa"),
        amount,
        closer: name(p.hubspot_owner_id) || "Sem closer",
        dealname: p.dealname || `Negócio ${id}`,
        url: dealUrl(id),
        sdrFarmer: clean(name(p.sdrfarmer_responsavel)),
        evento: clean(p.data_prevista_do_evento),
        palestrante: clean(p.palestrante_principal__ganho_) || clean(p.palestrante_de_interesse),
        produto: clean(p.produto_de_interesse),
        turma: clean(p.turma_the_best_weekend_) || clean(p.turma_the_best_weekend) || clean(p.turma_tbw_s),
      },
    };
  };

  const byDay = new Map<string, VendaDia>();
  let total = 0;
  let count = 0;
  const push = (saleMs: number, id: string, p: Record<string, string>) => {
    const { item, isWon, amount } = toItem(id, p);
    const k = dayKey(saleMs);
    let dia = byDay.get(k);
    if (!dia) { dia = { key: k, count: 0, total: 0, vendas: [] }; byDay.set(k, dia); }
    dia.vendas.push(item);
    if (isWon) { dia.count += 1; dia.total += amount; total += amount; count += 1; }
  };

  for (const d of raw) {
    if (VENDA_DIA_OVERRIDE.has(d.id)) continue; // tratado abaixo, pela closedate
    const saleMs = toMs(d.properties[stampProp]) ?? toMs(d.properties.closedate);
    if (saleMs != null) push(saleMs, d.id, d.properties);
  }

  // Override: esses IDs entram pela closedate (não pela entrada no ganho), se a
  // data cair no período visto. Assim aparecem no dia do fechamento (ex.: 31/08).
  if (VENDA_DIA_OVERRIDE.size > 0) {
    const ov = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: [...props, "pipeline"], inputs: [...VENDA_DIA_OVERRIDE].map((id) => ({ id })) }) }
    );
    for (const d of ov.results ?? []) {
      if (d.properties.pipeline !== pipe) continue; // só no segmento do negócio
      const saleMs = toMs(d.properties.closedate);
      if (saleMs != null && saleMs >= startMs && saleMs <= endMs) push(saleMs, d.id, d.properties);
    }
  }

  const dias = [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  // Dentro do dia: ganhos primeiro (valor desc), depois as que caíram.
  dias.forEach((d) => d.vendas.sort((a, b) => (a.status === b.status ? b.amount - a.amount : a.status === "ganho" ? -1 : 1)));
  return { dias, total, count };
}
