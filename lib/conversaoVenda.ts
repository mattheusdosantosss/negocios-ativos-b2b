// ============================================================
// Conversão de reunião → venda (B2C), por closer.
// Taxa = VENDAS do mês (negócios ganhos fechados no período, do closer, que
// tiveram ao menos 1 reunião de venda realizada dos 5 tipos — em QUALQUER data)
// ÷ REUNIÕES de venda realizadas (5 tipos) no período.
// Atribuição: a reunião conta sempre pro DONO DO NEGÓCIO (não pelo dono da
// reunião). Mistura proposital de datas: venda pela data de fechamento,
// reunião pela data da reunião — por isso a taxa pode passar de 100%.
// ============================================================
import { hsFetch, sleep, fetchAssocIds, pipelineIdFor, REUNIOES_TIPOS_VENDA_LISTA, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const brStart = (d: string) => new Date(d).getTime() + BR_OFFSET_MS;
const brEnd = (d: string) => new Date(d).getTime() + BR_OFFSET_MS + 86_400_000 - 1;
const TSET = new Set(REUNIOES_TIPOS_VENDA_LISTA);

export type ConvVendaCloser = { ownerId: string; nome: string; vendas: number; reunioes: number; ganhos: number };
export type ConversaoVendaData = {
  closers: ConvVendaCloser[];
  totalVendas: number;
  totalReunioes: number;
  totalGanhos: number;
};

type Deal = { id: string; properties: Record<string, string> };

export async function fetchConversaoVenda(
  config: SegmentConfig,
  opts: { from?: string; to?: string },
  _owners: Map<string, Owner>,
  nomeMap: Map<string, string>
): Promise<ConversaoVendaData> {
  const pipe = pipelineIdFor(config);
  const teamSet = new Set(config.team.map((m) => m.ownerId));
  // Sem período → mês corrente (BR).
  const nowBr = new Date(Date.now() - BR_OFFSET_MS);
  const startMs = opts.from ? brStart(opts.from) : Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), 1) + BR_OFFSET_MS;
  const endMs = opts.to ? brEnd(opts.to) : Date.now();

  // ---- 1) NUMERADOR: negócios ganhos fechados no período (por dono do negócio),
  //         que tiveram ao menos 1 reunião de venda realizada dos 5 tipos. ----
  const wonFilters = [
    { propertyName: "pipeline", operator: "EQ", value: pipe },
    { propertyName: "dealstage", operator: "IN", values: config.wonStageIds },
    { propertyName: "closedate", operator: "GTE", value: String(startMs) },
    { propertyName: "closedate", operator: "LTE", value: String(endMs) },
  ];
  const won: Deal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters: wonFilters }], properties: ["hubspot_owner_id"], limit: 100 };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: Deal[]; paging?: { next?: { after?: string } } }>(`/crm/v3/objects/deals/search`, { method: "POST", body: JSON.stringify(body) });
    won.push(...(r.results ?? []));
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after);

  // ganhos por closer (do time) + reuniões de cada ganho (qualquer data)
  const ganhosPorCloser = new Map<string, number>();
  const vendasPorCloser = new Map<string, number>();
  const wonByOwner = won.filter((d) => teamSet.has(d.properties.hubspot_owner_id || ""));
  for (const d of wonByOwner) {
    const oid = d.properties.hubspot_owner_id!;
    ganhosPorCloser.set(oid, (ganhosPorCloser.get(oid) || 0) + 1);
  }
  const wonIds = wonByOwner.map((d) => d.id);
  const wonAssoc = await fetchAssocIds("deals", "meetings", wonIds);
  const wonMeetIds = [...new Set([...wonAssoc.values()].flat())];
  const wonMeetInfo = new Map<string, { tipo: string; outcome: string }>();
  for (let i = 0; i < wonMeetIds.length; i += 100) {
    const chunk = wonMeetIds.slice(i, i + 100);
    const mr = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(`/crm/v3/objects/meetings/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties: ["hs_activity_type", "hs_meeting_outcome"], inputs: chunk.map((id) => ({ id })) }),
    });
    for (const m of mr.results ?? []) wonMeetInfo.set(m.id, { tipo: (m.properties.hs_activity_type || "").trim(), outcome: (m.properties.hs_meeting_outcome || "").toUpperCase() });
    if (i + 100 < wonMeetIds.length) await sleep(120);
  }
  for (const d of wonByOwner) {
    const enquadrada = (wonAssoc.get(d.id) ?? []).some((mid) => {
      const info = wonMeetInfo.get(mid);
      return info && TSET.has(info.tipo) && info.outcome === "COMPLETED";
    });
    if (enquadrada) {
      const oid = d.properties.hubspot_owner_id!;
      vendasPorCloser.set(oid, (vendasPorCloser.get(oid) || 0) + 1);
    }
  }

  // ---- 2) DENOMINADOR: reuniões de venda realizadas (5 tipos, COMPLETED) no
  //         período, atribuídas ao dono do negócio (B2C, closer do time). ----
  // 1 grupo só: tipo IN [5 tipos] + realizada + janela (evita o teto de 18
  // filtros do HubSpot que 5 grupos × 4 filtros estouravam).
  const meetFilters = [
    { propertyName: "hs_activity_type", operator: "IN", values: REUNIOES_TIPOS_VENDA_LISTA },
    { propertyName: "hs_meeting_outcome", operator: "EQ", value: "COMPLETED" },
    { propertyName: "hs_meeting_start_time", operator: "GTE", value: String(startMs) },
    { propertyName: "hs_meeting_start_time", operator: "LTE", value: String(endMs) },
  ];
  const meetIds: string[] = [];
  after = undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters: meetFilters }], properties: ["hs_meeting_start_time"], limit: 100 };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: { id: string }[]; paging?: { next?: { after?: string } } }>(`/crm/v3/objects/meetings/search`, { method: "POST", body: JSON.stringify(body) });
    for (const m of r.results ?? []) meetIds.push(String(m.id));
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after);

  // reunião → negócios; dono do negócio (B2C + time) recebe o crédito.
  const meetToDeals = await fetchAssocIds("meetings", "deals", meetIds);
  const denomDealIds = [...new Set([...meetToDeals.values()].flat())];
  const dealOwner = new Map<string, { pipe?: string; owner?: string }>();
  for (let i = 0; i < denomDealIds.length; i += 100) {
    const chunk = denomDealIds.slice(i, i + 100);
    const dr = await hsFetch<{ results?: Deal[] }>(`/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties: ["pipeline", "hubspot_owner_id"], inputs: chunk.map((id) => ({ id })) }),
    });
    for (const d of dr.results ?? []) dealOwner.set(d.id, { pipe: d.properties.pipeline, owner: d.properties.hubspot_owner_id });
    if (i + 100 < denomDealIds.length) await sleep(120);
  }
  const reunioesPorCloser = new Map<string, number>();
  for (const mid of meetIds) {
    const cands = meetToDeals.get(mid) ?? [];
    const hit = cands.map((id) => dealOwner.get(id)).find((d) => d && d.pipe === pipe && teamSet.has(d.owner || ""));
    if (hit?.owner) reunioesPorCloser.set(hit.owner, (reunioesPorCloser.get(hit.owner) || 0) + 1);
  }

  // ---- 3) Monta por closer (só quem tem alguma reunião ou venda no período). ----
  const oids = new Set<string>([...reunioesPorCloser.keys(), ...vendasPorCloser.keys(), ...ganhosPorCloser.keys()]);
  const closers: ConvVendaCloser[] = [...oids].map((oid) => ({
    ownerId: oid,
    nome: nomeMap.get(oid) || `Closer ${oid}`,
    vendas: vendasPorCloser.get(oid) || 0,
    reunioes: reunioesPorCloser.get(oid) || 0,
    ganhos: ganhosPorCloser.get(oid) || 0,
  }));
  closers.sort((a, b) => {
    const ta = a.reunioes ? a.vendas / a.reunioes : 0;
    const tb = b.reunioes ? b.vendas / b.reunioes : 0;
    return tb - ta || b.vendas - a.vendas;
  });

  const sum = (f: (c: ConvVendaCloser) => number) => closers.reduce((s, c) => s + f(c), 0);
  return {
    closers,
    totalVendas: sum((c) => c.vendas),
    totalReunioes: sum((c) => c.reunioes),
    totalGanhos: sum((c) => c.ganhos),
  };
}
