// ============================================================
// Proposta no mesmo dia (B2B) — GATILHO DE AGILIDADE, por closer, razão X/Y:
//   #1 SEM REUNIÃO: das QUALIFICAÇÕES do período sem reunião, em quantas o closer
//      mandou a proposta no MESMO DIA da qualificação. → enviadas / que tinha.
//   #2 COM REUNIÃO: das REUNIÕES do período, em quantas mandou a proposta no
//      MESMO DIA da reunião. → enviadas / que tinha.
// X (enviou no mesmo dia) em destaque; Y (que tinha) é o denominador.
// Data da proposta = 1ª data de anexação (valor mais antigo do histórico de
// data_de_envio_da_ultima_proposta). Segue o filtro do topo (sem filtro = mês).
// ============================================================
import { hsFetch, sleep, dealUrl, ownerDisplayName, fetchAssocIds, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  const ms = Number.isNaN(n) ? Date.parse(v) : n;
  return Number.isFinite(ms) ? ms : null;
};
const dayKey = (ms: number | null): string | null => {
  if (ms == null) return null;
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export type PMDDeal = { dealname: string; url: string; ok: boolean }; // ok = mandou proposta no mesmo dia
export type PMDCloser = {
  ownerId: string;
  nome: string;
  semComp: number; semElig: number; // #1 sem reunião: enviadas / que tinha
  comComp: number; comElig: number; // #2 com reunião: enviadas / que tinha
  dealsSem: PMDDeal[]; dealsCom: PMDDeal[];
};
export type PropostaMesmoDiaData = {
  closers: PMDCloser[];
  totalSemComp: number; totalSemElig: number;
  totalComComp: number; totalComElig: number;
};

type Filter = { propertyName: string; operator: string; value?: string; values?: string[] };

async function searchAll(path: string, filters: Filter[], properties: string[]): Promise<{ id: string; properties: Record<string, string> }[]> {
  const out: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = { filterGroups: [{ filters }], properties, limit: 200 };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(path, { method: "POST", body: JSON.stringify(body) });
    out.push(...(r.results ?? []));
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after && out.length < 9800);
  return out;
}

export async function fetchPropostaMesmoDia(
  config: SegmentConfig,
  opts: { from?: string; to?: string; owner?: string },
  owners: Map<string, Owner>,
  nomeMap: Map<string, string>
): Promise<PropostaMesmoDiaData> {
  const pipe = config.id === "b2c" ? "725182862" : "default";
  const now = Date.now();
  const nowBr = new Date(now - BR_OFFSET_MS);
  // Janela: filtro do topo; sem filtro → mês corrente (métrica do dia-a-dia).
  const startMs = opts.from
    ? new Date(opts.from).getTime() + BR_OFFSET_MS
    : Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), 1) + BR_OFFSET_MS;
  const endMs = opts.to ? new Date(opts.to).getTime() + BR_OFFSET_MS + 86_400_000 - 1 : now;
  const inWin = (ms: number | null) => ms != null && ms >= startMs && ms <= endMs;

  // 1) Qualificações no período (candidatos do bucket #1).
  const qualFilters: Filter[] = [
    { propertyName: "pipeline", operator: "EQ", value: pipe },
    { propertyName: "pipedrive___data_de_qualificacao", operator: "GTE", value: String(startMs) },
    { propertyName: "pipedrive___data_de_qualificacao", operator: "LTE", value: String(endMs) },
  ];
  if (opts.owner) qualFilters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });
  const qualDeals = await searchAll(`/crm/v3/objects/deals/search`, qualFilters, ["dealname", "hubspot_owner_id", "pipedrive___data_de_qualificacao"]);

  // 2) Reuniões no período → negócios com reunião no período (candidatos do #2).
  const meets = await searchAll(`/crm/v3/objects/meetings/search`,
    [{ propertyName: "hs_meeting_start_time", operator: "GTE", value: String(startMs) }, { propertyName: "hs_meeting_start_time", operator: "LTE", value: String(endMs) }],
    ["hs_meeting_start_time"]);
  const meetDay = new Map<string, string>(); // meetingId → dia
  for (const m of meets) { const dk = dayKey(toMs(m.properties.hs_meeting_start_time)); if (dk) meetDay.set(m.id, dk); }
  const meetToDeals = await fetchAssocIds("meetings", "deals", meets.map((m) => m.id)); // meetingId → dealIds
  const dealMeetInPeriod = new Map<string, Set<string>>(); // dealId → dias de reunião no período
  for (const [mid, dealIds] of meetToDeals) {
    const dk = meetDay.get(mid);
    if (!dk) continue;
    for (const did of dealIds) {
      if (!dealMeetInPeriod.has(did)) dealMeetInPeriod.set(did, new Set());
      dealMeetInPeriod.get(did)!.add(dk);
    }
  }

  // 3) Universo de candidatos = qualificados no período ∪ com reunião no período.
  const dealProps = new Map<string, Record<string, string>>();
  for (const d of qualDeals) dealProps.set(d.id, d.properties);
  const allIds = [...new Set([...qualDeals.map((d) => d.id), ...dealMeetInPeriod.keys()])];

  // 4) Lê props (pipeline/owner/qual) + 1ª data da proposta (histórico) dos que
  //    faltam (os que vieram só via reunião). batch/read c/ histórico: máx 50.
  const missing = allIds.filter((id) => !dealProps.has(id));
  const firstProp = new Map<string, number>();
  for (let i = 0; i < allIds.length; i += 50) {
    const chunk = allIds.slice(i, i + 50);
    const res = await hsFetch<{ results?: { id: string; properties: Record<string, string>; propertiesWithHistory?: { data_de_envio_da_ultima_proposta?: { value: string; timestamp: string }[] } }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: ["dealname", "hubspot_owner_id", "pipedrive___data_de_qualificacao", "pipeline"], propertiesWithHistory: ["data_de_envio_da_ultima_proposta"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) {
      if (missing.includes(d.id)) dealProps.set(d.id, d.properties);
      let best: { v: string; t: number } | null = null;
      for (const h of d.propertiesWithHistory?.data_de_envio_da_ultima_proposta ?? []) {
        if (!h.value) continue;
        const t = Date.parse(h.timestamp);
        if (Number.isFinite(t) && (!best || t < best.t)) best = { v: h.value, t };
      }
      const ms = best ? toMs(best.v) : null;
      if (ms != null) firstProp.set(d.id, ms);
    }
    if (i + 50 < allIds.length) await sleep(120);
  }

  // 5) Reuniões (existência) de todos os candidatos — pro #1 exigir SEM reunião.
  const anyMeet = await fetchAssocIds("deals", "meetings", allIds); // dealId → meetingIds

  // 6) Classifica por closer.
  const nomeOf = (oid: string) => nomeMap.get(oid) || ownerDisplayName(owners.get(oid)) || "Sem closer";
  const byCloser = new Map<string, PMDCloser>();
  const get = (oid: string) => {
    if (!byCloser.has(oid)) byCloser.set(oid, { ownerId: oid, nome: nomeOf(oid), semComp: 0, semElig: 0, comComp: 0, comElig: 0, dealsSem: [], dealsCom: [] });
    return byCloser.get(oid)!;
  };
  for (const id of allIds) {
    const p = dealProps.get(id);
    if (!p || (p.pipeline && p.pipeline !== pipe)) continue; // só B2B
    if (opts.owner && p.hubspot_owner_id !== opts.owner) continue;
    const oid = p.hubspot_owner_id || "";
    const propDay = dayKey(firstProp.get(id) ?? null);
    const qualMs = toMs(p.pipedrive___data_de_qualificacao);
    const qualDay = dayKey(qualMs);
    const hasMeeting = (anyMeet.get(id)?.length ?? 0) > 0;
    const meetDays = dealMeetInPeriod.get(id); // reuniões no período
    const dl = (ok: boolean): PMDDeal => ({ dealname: p.dealname || `Negócio ${id}`, url: dealUrl(id), ok });

    // #2 COM REUNIÃO: reunião no período → elegível; enviou se proposta no dia da reunião.
    if (meetDays && meetDays.size > 0) {
      const ok = !!propDay && meetDays.has(propDay);
      const c = get(oid); c.comElig += 1; if (ok) c.comComp += 1; c.dealsCom.push(dl(ok));
    }
    // #1 SEM REUNIÃO: qualificado no período E sem reunião nenhuma → elegível;
    //    enviou se proposta no dia da qualificação.
    else if (!hasMeeting && inWin(qualMs)) {
      const ok = !!propDay && !!qualDay && propDay === qualDay;
      const c = get(oid); c.semElig += 1; if (ok) c.semComp += 1; c.dealsSem.push(dl(ok));
    }
  }

  const closers = [...byCloser.values()].sort((a, b) => (b.comElig + b.semElig) - (a.comElig + a.semElig));
  return {
    closers,
    totalSemComp: closers.reduce((s, c) => s + c.semComp, 0),
    totalSemElig: closers.reduce((s, c) => s + c.semElig, 0),
    totalComComp: closers.reduce((s, c) => s + c.comComp, 0),
    totalComElig: closers.reduce((s, c) => s + c.comElig, 0),
  };
}
