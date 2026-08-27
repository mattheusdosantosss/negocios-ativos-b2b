// ============================================================
// Vendas do Dia — feed de ganhos das duas pipelines (B2B + B2C),
// agrupado por dia (closedate). Substitui o "Histórico de vendas".
// ============================================================

import { hsFetch, sleep, dealUrl, ownerDisplayName, type Owner } from "./hubspot";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const startOf = (from?: string) => (from ? new Date(from).getTime() + BR_OFFSET_MS : Date.now() - 30 * 86_400_000);
const endOf = (to?: string) => (to ? new Date(to).getTime() + BR_OFFSET_MS + 86_400_000 - 1 : Date.now());
const dayKey = (ms: number): string => {
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// Pipelines e etapas de ganho das duas verticais.
const B2B_PIPE = "default";
const B2C_PIPE = "725182862";
const WON_STAGES = ["1076664462", "1076664460", "1105295876"]; // B2B (2) + B2C (1)

export type VendaItem = {
  seg: "b2b" | "b2c";
  amount: number;
  closer: string;
  dealname: string;
  url: string;
  sdrFarmer?: string;
  evento?: string; // data prevista do evento (ISO date)
  palestrante?: string;
  produto?: string;
  turma?: string;
};
export type VendaDia = { key: string; count: number; total: number; vendas: VendaItem[] };
export type VendasDoDiaData = { dias: VendaDia[]; total: number; count: number };

export async function fetchVendasDoDia(opts: { from?: string; to?: string }, owners: Map<string, Owner>): Promise<VendasDoDiaData> {
  const startMs = startOf(opts.from);
  const endMs = endOf(opts.to);
  const props = [
    "dealname", "amount", "hubspot_owner_id", "pipeline", "closedate",
    "sdrfarmer_responsavel", "data_prevista_do_evento",
    "palestrante_principal__ganho_", "palestrante_de_interesse",
    "produto_de_interesse", "turma_the_best_weekend_", "turma_the_best_weekend", "turma_tbw_s",
  ];
  const filters = [
    { propertyName: "pipeline", operator: "IN", values: [B2B_PIPE, B2C_PIPE] },
    { propertyName: "dealstage", operator: "IN", values: WON_STAGES },
    { propertyName: "closedate", operator: "GTE", value: String(startMs) },
    { propertyName: "closedate", operator: "LTE", value: String(endMs) },
  ];

  const raw: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties: props, sorts: [{ propertyName: "closedate", direction: "DESCENDING" }], limit: 200 };
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

  const byDay = new Map<string, VendaDia>();
  let total = 0;
  for (const d of raw) {
    const p = d.properties;
    const closeMs = Date.parse(p.closedate);
    if (Number.isNaN(closeMs)) continue;
    const amount = Number(p.amount) || 0;
    const seg: "b2b" | "b2c" = p.pipeline === B2C_PIPE ? "b2c" : "b2b";
    const item: VendaItem = {
      seg,
      amount,
      closer: name(p.hubspot_owner_id) || "Sem closer",
      dealname: p.dealname || `Negócio ${d.id}`,
      url: dealUrl(d.id),
      sdrFarmer: clean(name(p.sdrfarmer_responsavel)),
      evento: clean(p.data_prevista_do_evento),
      palestrante: clean(p.palestrante_principal__ganho_) || clean(p.palestrante_de_interesse),
      produto: clean(p.produto_de_interesse),
      turma: clean(p.turma_the_best_weekend_) || clean(p.turma_the_best_weekend) || clean(p.turma_tbw_s),
    };
    const k = dayKey(closeMs);
    let dia = byDay.get(k);
    if (!dia) { dia = { key: k, count: 0, total: 0, vendas: [] }; byDay.set(k, dia); }
    dia.vendas.push(item);
    dia.count += 1;
    dia.total += amount;
    total += amount;
  }

  const dias = [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1)); // dias desc
  dias.forEach((d) => d.vendas.sort((a, b) => b.amount - a.amount));
  return { dias, total, count: raw.length };
}
