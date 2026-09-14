// ============================================================
// Proposta no mesmo dia (B2B) — por closer, quantas propostas foram ENVIADAS
// (anexadas: data_de_envio_da_ultima_proposta) no MESMO DIA de:
//   #1 sem reunião agendada  → data da QUALIFICAÇÃO
//   #2 com reunião agendada  → data da REUNIÃO
// Mede a agilidade do closer em mandar a proposta no dia. Segue o filtro de tempo.
// ============================================================
import { hsFetch, sleep, dealUrl, ownerDisplayName, fetchAssocIds, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const dayKey = (v?: string): string | null => {
  if (!v) return null;
  const t = Number(v);
  const ms = Number.isNaN(t) ? Date.parse(v) : t;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export type PMDDeal = { dealname: string; url: string };
export type PMDCloser = { ownerId: string; nome: string; sem: number; com: number; dealsSem: PMDDeal[]; dealsCom: PMDDeal[] };
export type PropostaMesmoDiaData = { closers: PMDCloser[]; totalSem: number; totalCom: number };

type Filter = { propertyName: string; operator: string; value?: string; values?: string[] };

export async function fetchPropostaMesmoDia(
  config: SegmentConfig,
  opts: { from?: string; to?: string; owner?: string },
  owners: Map<string, Owner>,
  nomeMap: Map<string, string>
): Promise<PropostaMesmoDiaData> {
  const pipe = config.id === "b2c" ? "725182862" : "default";
  const now = Date.now();
  const nowBr = new Date(now - BR_OFFSET_MS);
  // Janela pela data de envio da proposta. Sem filtro do topo → mês corrente
  // (a métrica é do dia-a-dia; varrer todo o histórico não faz sentido e pesa).
  // Teto sempre ≤ hoje: a propriedade tem lixo com data no futuro.
  const startMs = opts.from
    ? new Date(opts.from).getTime() + BR_OFFSET_MS
    : Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), 1) + BR_OFFSET_MS;
  const endMs = Math.min(opts.to ? new Date(opts.to).getTime() + BR_OFFSET_MS + 86_400_000 - 1 : now, now);

  // Busca por candidatos: a data ATUAL do campo (última proposta) >= início da
  // janela e <= hoje (o campo tem lixo no futuro). A 1ª proposta (do histórico)
  // é sempre <= a última, então esse recorte não perde ninguém; filtramos pela
  // 1ª data depois de apurá-la.
  const filters: Filter[] = [
    { propertyName: "pipeline", operator: "EQ", value: pipe },
    { propertyName: "data_de_envio_da_ultima_proposta", operator: "GTE", value: String(startMs) },
    { propertyName: "data_de_envio_da_ultima_proposta", operator: "LTE", value: String(now) },
  ];
  if (opts.owner) filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });

  const deals: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: ["dealname", "hubspot_owner_id", "pipedrive___data_de_qualificacao", "data_de_envio_da_ultima_proposta"],
      limit: 200,
    };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/deals/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    deals.push(...(r.results ?? []));
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after && deals.length < 9800);

  // "Sempre a PRIMEIRA proposta": o campo guarda só a última, então a data da 1ª
  // proposta anexada = o valor MAIS ANTIGO do histórico. batch/read c/ histórico:
  // máx 50 inputs por chamada.
  const firstProp = new Map<string, number>();
  const dealIds = deals.map((d) => d.id);
  for (let i = 0; i < dealIds.length; i += 50) {
    const chunk = dealIds.slice(i, i + 50);
    const res = await hsFetch<{ results?: { id: string; propertiesWithHistory?: { data_de_envio_da_ultima_proposta?: { value: string; timestamp: string }[] } }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ propertiesWithHistory: ["data_de_envio_da_ultima_proposta"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) {
      let best: { v: string; t: number } | null = null;
      for (const h of d.propertiesWithHistory?.data_de_envio_da_ultima_proposta ?? []) {
        if (!h.value) continue;
        const t = Date.parse(h.timestamp);
        if (Number.isFinite(t) && (!best || t < best.t)) best = { v: h.value, t };
      }
      if (best) {
        const n = Number(best.v);
        const ms = Number.isNaN(n) ? Date.parse(best.v) : n;
        if (Number.isFinite(ms)) firstProp.set(d.id, ms);
      }
    }
    if (i + 50 < dealIds.length) await sleep(120);
  }

  // Reuniões associadas (define "com/sem reunião") + a data de cada reunião.
  const assoc = await fetchAssocIds("deals", "meetings", deals.map((d) => d.id));
  const allM = [...new Set([...assoc.values()].flat())];
  const mDay = new Map<string, string>();
  for (let i = 0; i < allM.length; i += 100) {
    const chunk = allM.slice(i, i + 100);
    const mr = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `/crm/v3/objects/meetings/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: ["hs_meeting_start_time"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const m of mr.results ?? []) {
      const dk = dayKey(m.properties.hs_meeting_start_time);
      if (dk) mDay.set(m.id, dk);
    }
    if (i + 100 < allM.length) await sleep(120);
  }

  const nomeOf = (oid: string) => nomeMap.get(oid) || ownerDisplayName(owners.get(oid)) || "Sem closer";
  const byCloser = new Map<string, PMDCloser>();
  for (const d of deals) {
    const propMs = firstProp.get(d.id);
    // Janela pela 1ª data de proposta (não pela última).
    if (propMs == null || propMs < startMs || propMs > endMs) continue;
    const oid = d.properties.hubspot_owner_id || "";
    const propD = dayKey(String(propMs));
    const qualD = dayKey(d.properties.pipedrive___data_de_qualificacao);
    const mids = assoc.get(d.id) ?? [];
    const mdays = mids.map((id) => mDay.get(id)).filter(Boolean) as string[];
    // #2 com reunião: proposta no mesmo dia de ALGUMA reunião.
    // #1 sem reunião: proposta no mesmo dia da qualificação.
    const bucket: "sem" | "com" | null = mids.length
      ? propD && mdays.includes(propD) ? "com" : null
      : propD && qualD && propD === qualD ? "sem" : null;
    if (!bucket) continue;
    if (!byCloser.has(oid)) byCloser.set(oid, { ownerId: oid, nome: nomeOf(oid), sem: 0, com: 0, dealsSem: [], dealsCom: [] });
    const c = byCloser.get(oid)!;
    const dl: PMDDeal = { dealname: d.properties.dealname || `Negócio ${d.id}`, url: dealUrl(d.id) };
    if (bucket === "sem") { c.sem += 1; c.dealsSem.push(dl); } else { c.com += 1; c.dealsCom.push(dl); }
  }
  const closers = [...byCloser.values()].sort((a, b) => (b.sem + b.com) - (a.sem + a.com));
  return {
    closers,
    totalSem: closers.reduce((s, c) => s + c.sem, 0),
    totalCom: closers.reduce((s, c) => s + c.com, 0),
  };
}
