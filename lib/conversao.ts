// ============================================================
// Funil de conversão por vertical (B2B e B2C) — live do HubSpot
// ============================================================
//
// Conversão = vendas ÷ propostas. O denominador ("propostas") é montado por
// CARIMBOS de etapa, não pelo estágio atual (que se perde quando o negócio
// avança):
//   A  tem carimbo de "Proposta enviada"        → usa a data real
//   B  não tem A, mas tem "Em negociação"        → imputa a data desse carimbo
//   C  não tem A/B, mas tem "Negociação avançada" (só B2B) → imputa essa data
//   D  ganho sem carimbo nenhum                  → EXCLUÍDO (viés de só-ganhos)
// Perdidos sem rastro também ficam fora (não dá pra saber se perderam antes ou
// depois da proposta).
//
// Método por mês:
//   B2C — coorte pura sempre (ciclo curto: 48% em 7d, 86% em 30d).
//   B2B — coorte nos meses maduros; janela defasada [dia 16 do mês anterior →
//         dia 15 do mês atual] nos ~3 últimos meses (ciclo longo, p90≈58d), com
//         o numerador = ganhos por closedate no mês.
//
// Validado contra o snapshot de 26/08/2026 (b2b_mensal.csv / b2c_mensal.csv):
// meses fechados batem exato; ago e coortes recentes variam ±1-2 por ser live.

import { hsFetch, sleep } from "./hubspot";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3

export type ConvCell = { propostas: number; vendas: number; taxa: number; receita: number };
export type ConvMonthRow = {
  key: string; // "YYYY-MM"
  label: string; // "jan/26"
  metodo: "coorte" | "janela";
  total: ConvCell;
  porSegmento: Record<string, ConvCell>;
};
export type ConvVertical = {
  vertical: "b2b" | "b2c";
  label: string;
  segmentos: string[]; // canais (B2B) ou produtos (B2C), na ordem de exibição
  meses: ConvMonthRow[];
  total: ConvCell; // acumulado do período
  nota: string;
};
export type ConversaoData = {
  b2b: ConvVertical;
  b2c: ConvVertical;
  periodo: { de: string; ate: string };
};

// ---- helpers de data (fuso BR) ----
const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (ms: number | null): string | null => {
  if (ms == null || Number.isNaN(ms)) return null;
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${MES_ABREV[m - 1]}/${String(y).slice(2)}`;
};
const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && v.length >= 10) return n; // epoch ms
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};
// janela defasada do B2B: [dia 16 do mês anterior 00:00 BR, dia 15 do mês atual 23:59:59 BR]
const janela = (y: number, m1to12: number): [number, number] => {
  const prevY = m1to12 === 1 ? y - 1 : y;
  const prevM0 = (m1to12 === 1 ? 12 : m1to12 - 1) - 1;
  const start = Date.UTC(prevY, prevM0, 16) + BR_OFFSET_MS;
  const end = Date.UTC(y, m1to12 - 1, 16) + BR_OFFSET_MS - 1; // até dia 15 23:59:59.999 BR
  return [start, end];
};

// meses de jan/2026 até o mês atual (BR)
function monthsUntilNow(): string[] {
  const now = new Date(Date.now() - BR_OFFSET_MS);
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  const out: string[] = [];
  for (let y = 2026, m = 1; y < curY || (y === curY && m <= curM); m++) {
    if (m > 12) { m = 1; y++; if (y > curY) break; }
    out.push(`${y}-${pad(m)}`);
    if (y === curY && m === curM) break;
  }
  return out;
}

const gteMs = String(Date.UTC(2026, 0, 1) + BR_OFFSET_MS);
const lteMs = () => String(Date.now()); // até agora

type Filter = { propertyName: string; operator: string; value?: string };
async function searchDeals(pipeline: string, groups: { filters: Filter[] }[], props: string[]): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: groups, properties: props, limit: 100 };
    if (after) body.after = after;
    const data = await hsFetch<{ results?: { properties?: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/deals/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    for (const d of data.results ?? []) out.push(d.properties ?? {});
    after = data.paging?.next?.after;
    if (after) await sleep(160);
  } while (after);
  return out;
}

const zeroCell = (): ConvCell => ({ propostas: 0, vendas: 0, taxa: 0, receita: 0 });
const finalize = (c: ConvCell): ConvCell => ({ ...c, taxa: c.propostas > 0 ? c.vendas / c.propostas : 0 });

// ---------- B2B ----------
const B2B = {
  pipeline: "default",
  ganho: ["1076664462", "1076664460"],
  proposta: "hs_v2_date_entered_closedwon",
  emNeg: "hs_v2_date_entered_closedlost",
  negAv: "hs_v2_date_entered_1167445770",
};
const CANAIS_B2B = ["Inbound", "Farmer", "Palestrante"];
function canalB2B(p: Record<string, string>): string {
  let primary = (p.origem_da_qualificacao || "").trim();
  if (!primary) primary = (p.origem_do_lead || "").trim();
  if (primary === "Ação de CRM") return (p.esse_negocio_e_de_kam_ || "").startsWith("Sim") ? "Farmer" : "Inbound";
  const MAP: Record<string, string[]> = {
    Inbound: ["Inbound", "Indicação", "Indicação Partner | B2B", "Ação de CRM (não-carteira)"],
    Farmer: ["Farmer", "KAM", "Cadência do BDR", "Curador", "Carteira do Farmer", "Ação de CRM (carteira)"],
    Palestrante: ["Palestrante", "Base de Palestrantes", "Agência de Palestrantes"],
  };
  for (const k of Object.keys(MAP)) if (MAP[k].includes(primary)) return k;
  return "Inbound"; // fallback dos não mapeados
}

// ---------- B2C ----------
const B2C = {
  pipeline: "725182862",
  ganho: ["1105295876"],
  proposta: "hs_v2_date_entered_1057266722",
  emNeg: "hs_v2_date_entered_1275670104",
};
const PRODUTOS_B2C = ["TBW Weekend", "Best Day+"];
function produtoB2C(p: Record<string, string>): string | null {
  const raw = (p.produto_de_interesse || "").split(";").map((s) => s.trim()).filter(Boolean);
  const TBW = ["TBW Weekend (Presencial)", "Não se aplica"];
  const BEST = ["Pré The Best Weekend", "Amolador", "TBW Weeks (Online)", "The Best Weeks (pré lançamento)"];
  if (raw.length === 0) return "TBW Weekend"; // "(vazio)" → TBW Weekend
  if (raw.some((r) => TBW.includes(r))) return "TBW Weekend";
  if (raw.some((r) => BEST.includes(r))) return "Best Day+";
  return null; // só expansão (Legacy/Ecossistema/…) → fora da aquisição
}

type DenomDeal = { stamp: number | null; sMonth: string | null; ganho: boolean; closeMonth: string | null; amount: number; seg: string | null };

function buildVertical(
  vertical: "b2b" | "b2c",
  label: string,
  deals: DenomDeal[],
  segmentos: string[],
  janelaMeses: Set<string>,
  nota: string
): ConvVertical {
  const meses: ConvMonthRow[] = [];
  const acc = zeroCell();
  for (const mk of monthsUntilNow()) {
    const [y, m] = mk.split("-").map(Number);
    const usaJanela = janelaMeses.has(mk);
    const total = zeroCell();
    const porSegmento: Record<string, ConvCell> = {};
    for (const s of segmentos) porSegmento[s] = zeroCell();

    for (const d of deals) {
      if (!d.seg) continue;
      let ehProposta = false;
      let ehVenda = false;
      if (usaJanela) {
        const [ws, we] = janela(y, m);
        ehProposta = d.stamp != null && d.stamp >= ws && d.stamp <= we;
        ehVenda = d.ganho && d.closeMonth === mk; // numerador por closedate
      } else {
        ehProposta = d.sMonth === mk;
        ehVenda = ehProposta && d.ganho;
      }
      if (ehProposta) {
        total.propostas++;
        porSegmento[d.seg].propostas++;
      }
      if (ehVenda) {
        total.vendas++;
        total.receita += d.amount;
        porSegmento[d.seg].vendas++;
        porSegmento[d.seg].receita += d.amount;
      }
    }
    for (const s of segmentos) porSegmento[s] = finalize(porSegmento[s]);
    meses.push({ key: mk, label: mesLabel(mk), metodo: usaJanela ? "janela" : "coorte", total: finalize(total), porSegmento });
    acc.propostas += total.propostas;
    acc.vendas += total.vendas;
    acc.receita += total.receita;
  }
  return { vertical, label, segmentos, meses, total: finalize(acc), nota };
}

export async function fetchConversao(): Promise<ConversaoData> {
  const lte = lteMs();
  const rangeStamp = (prop: string): Filter[] => [
    { propertyName: prop, operator: "GTE", value: gteMs },
    { propertyName: prop, operator: "LTE", value: lte },
  ];

  // últimos 3 meses (inclui o atual) usam janela no B2B
  const meses = monthsUntilNow();
  const janelaMeses = new Set(meses.slice(-3));

  // ---- B2B ----
  const b2bProps = ["dealstage", "closedate", "amount_in_home_currency", "origem_da_qualificacao", "origem_do_lead", "esse_negocio_e_de_kam_", B2B.proposta, B2B.emNeg, B2B.negAv];
  const b2bRaw = await searchDeals(B2B.pipeline, [
    { filters: rangeStamp(B2B.proposta) },
    { filters: [{ propertyName: B2B.proposta, operator: "NOT_HAS_PROPERTY" }, ...rangeStamp(B2B.emNeg)] },
    { filters: [{ propertyName: B2B.proposta, operator: "NOT_HAS_PROPERTY" }, { propertyName: B2B.emNeg, operator: "NOT_HAS_PROPERTY" }, ...rangeStamp(B2B.negAv)] },
  ], b2bProps);
  const b2bDeals: DenomDeal[] = b2bRaw.map((p) => {
    const stamp = toMs(p[B2B.proposta]) ?? toMs(p[B2B.emNeg]) ?? toMs(p[B2B.negAv]);
    return { stamp, sMonth: monthKey(stamp), ganho: B2B.ganho.includes(p.dealstage), closeMonth: monthKey(toMs(p.closedate)), amount: Number(p.amount_in_home_currency) || 0, seg: canalB2B(p) };
  });

  // ---- B2C ----
  const b2cProps = ["dealstage", "closedate", "amount_in_home_currency", "produto_de_interesse", B2C.proposta, B2C.emNeg];
  const b2cRaw = await searchDeals(B2C.pipeline, [
    { filters: rangeStamp(B2C.proposta) },
    { filters: [{ propertyName: B2C.proposta, operator: "NOT_HAS_PROPERTY" }, ...rangeStamp(B2C.emNeg)] },
  ], b2cProps);
  const b2cDeals: DenomDeal[] = b2cRaw.map((p) => {
    const stamp = toMs(p[B2C.proposta]) ?? toMs(p[B2C.emNeg]);
    return { stamp, sMonth: monthKey(stamp), ganho: B2C.ganho.includes(p.dealstage), closeMonth: monthKey(toMs(p.closedate)), amount: Number(p.amount_in_home_currency) || 0, seg: produtoB2C(p) };
  });

  return {
    b2b: buildVertical("b2b", "B2B", b2bDeals, CANAIS_B2B, janelaMeses,
      "Coorte da proposta nos meses maduros; janela defasada 16→15 nos 3 últimos meses. Por canal (origem da qualificação)."),
    b2c: buildVertical("b2c", "B2C · aquisição", b2cDeals, PRODUTOS_B2C, new Set(),
      "Coorte pura da proposta. Só aquisição (TBW Weekend / Best Day+); expansão (Legacy, Mentorias…) fica fora."),
    periodo: { de: "2026-01", ate: meses[meses.length - 1] },
  };
}
