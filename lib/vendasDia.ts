// ============================================================
// Vendas do Dia — ganhos do segmento agrupados por dia pela data de fechamento
// MAIS ANTIGA do HISTÓRICO da closedate: o momento em que o negócio foi dado
// como ganho pela 1ª vez. Reabrir/editar o closedate depois NUNCA move a venda
// de dia (reabertura empurra pra frente; a mais antiga é a real). Vendas que
// "caíram" (saíram do ganho) ficam sinalizadas, não somem.
// ============================================================

import { hsFetch, sleep, dealUrl, ownerDisplayName, fetchAssocIds, type Owner } from "./hubspot";
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
// valor_bruto (B2C) é TEXTO livre, preenchido em formatos variados: "5000",
// "R$ 22.000", "R$ 1.347,30". Parse robusto de moeda BR: vírgula = decimal,
// ponto = milhar (quando seguido de 3 dígitos). Retorna 0 se não der número.
// ponytail: assume formatação BR; um "4500.5" (ponto decimal sem vírgula) fica
// como 4500.5 — não vira 45005, pois só tiro ponto de milhar (3 dígitos).
const parseBRL = (v?: string): number => {
  if (!v) return 0;
  let s = v.replace(/[^\d.,]/g, ""); // tira "R$", espaços, etc.
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", "."); // vírgula decimal → ponto milhar fora
  } else {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, ""); // ponto de milhar (3 dígitos) → remove
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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
    "sdrfarmer_responsavel", "data_prevista_do_evento",
    "produto_de_interesse", "turma_the_best_weekend_", "turma_the_best_weekend", "turma_tbw_s",
  ];
  // Candidatos: negócios que ENTRARAM em alguma etapa de ganho (won-stamp existe
  // → ganhos + os que "caíram"). Busca por closedate ATUAL com uma MARGEM larga
  // (o dia real = 1ª data de fechamento do histórico; a atual pode ter sido
  // editada pra fora da janela). Filtra pela 1ª data de fechamento depois, no loop.
  // ponytail: a busca é pela closedate ATUAL, mas o dia = a mais antiga; uma
  // reabertura empurra a atual pra frente, então a margem tem que cobrir o gap
  // (vistos até ~20 dias) pra não perder o negócio. 30 dias cobre com folga.
  const SEARCH_MARGIN_MS = 30 * 86_400_000;
  const filterGroups = config.wonStageIds.map((sid) => ({
    filters: [
      { propertyName: "pipeline", operator: "EQ", value: pipe },
      { propertyName: `hs_v2_date_entered_${sid}`, operator: "HAS_PROPERTY" },
      { propertyName: "closedate", operator: "GTE", value: String(startMs - SEARCH_MARGIN_MS) },
      { propertyName: "closedate", operator: "LTE", value: String(endMs + SEARCH_MARGIN_MS) },
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

  // Dia da venda = a MENOR (mais antiga) data de fechamento já registrada no
  // histórico da closedate — auto ou manual. Reaberturas e carimbos errados da
  // automação sempre empurram a data pra FRENTE; a correção traz de volta pra
  // data real, que é a mais antiga. Assim reabrir/editar nunca move a venda de
  // dia, e um carimbo errado corrigido pra uma data anterior (ex.: 01/09 → 31/08)
  // também acerta. batch/read c/ histórico: máx 50 inputs.
  const firstClose = new Map<string, number>();
  const rawIds = raw.map((d) => d.id);
  for (let i = 0; i < rawIds.length; i += 50) {
    const chunk = rawIds.slice(i, i + 50);
    const res = await hsFetch<{ results?: { id: string; propertiesWithHistory?: { closedate?: { value: string }[] } }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ propertiesWithHistory: ["closedate"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) {
      let minMs: number | null = null;
      for (const h of d.propertiesWithHistory?.closedate ?? []) {
        const v = toMs(h.value);
        if (v != null && (minMs == null || v < minMs)) minMs = v;
      }
      if (minMs != null) firstClose.set(d.id, minMs);
    }
    if (i + 50 < rawIds.length) await sleep(120);
  }

  const name = (id?: string) => (id ? ownerDisplayName(owners.get(id)) : "");
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const seg: "b2b" | "b2c" = config.id === "b2c" ? "b2c" : "b2b";

  // Palestrante vendido (só B2B): vem dos ITENS DE LINHA do negócio (o `name` do
  // item = o nome do palestrante; pode haver mais de um). A propriedade
  // palestrante_principal_correta era corrompida por integração — trocada pelo
  // item de linha. 2 fases em lote: associação deal→line_items + leitura dos names.
  const palByDeal = new Map<string, string>();
  if (seg === "b2b" && raw.length) {
    const assoc = await fetchAssocIds("deals", "line_items", raw.map((d) => d.id));
    const allLi = [...new Set([...assoc.values()].flat())];
    const liName = new Map<string, string>();
    for (let i = 0; i < allLi.length; i += 100) {
      const chunk = allLi.slice(i, i + 100);
      const res = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
        `/crm/v3/objects/line_items/batch/read`,
        { method: "POST", body: JSON.stringify({ properties: ["name", "hs_product_name"], inputs: chunk.map((id) => ({ id })) }) }
      );
      for (const li of res.results ?? []) {
        const nm = (li.properties.name || li.properties.hs_product_name || "").trim();
        if (nm) liName.set(li.id, nm);
      }
      if (i + 100 < allLi.length) await sleep(120);
    }
    for (const [dealId, liIds] of assoc) {
      const nomes = liIds.map((id) => liName.get(id)).filter(Boolean) as string[];
      if (nomes.length) palByDeal.set(dealId, nomes.join(", "));
    }
  }

  const toItem = (id: string, p: Record<string, string>): { item: VendaItem; isWon: boolean; bruto: number; liquido: number } => {
    const amount = Number(p.amount) || 0;
    // Bruto por segmento: B2B usa "valor total do contrato (ganho)"; B2C usa
    // "valor_bruto". Líquido = "Valor" (amount) nos dois. Quando o bruto não vem
    // preenchido, bruto = amount → sem distinção (mostra só um valor).
    const brutoGanho = seg === "b2c"
      ? parseBRL(p.valor_bruto) // texto BR ("R$ 22.000")
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
        palestrante: seg === "b2b" ? (palByDeal.get(id) || undefined) : undefined,
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
    // Dia da venda = data de fechamento mais antiga do histórico (firstClose);
    // fallback pro closedate atual só se não houver histórico.
    const saleMs = firstClose.get(d.id) ?? toMs(d.properties.closedate);
    if (saleMs != null && saleMs >= startMs && saleMs <= endMs) push(saleMs, d.id, d.properties);
  }

  const dias = [...byDay.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  // Dentro do dia: ganhos primeiro (valor bruto desc), depois as que caíram.
  dias.forEach((d) => d.vendas.sort((a, b) => (a.status === b.status ? b.bruto - a.bruto : a.status === "ganho" ? -1 : 1)));
  return { dias, total, totalLiq, count };
}
