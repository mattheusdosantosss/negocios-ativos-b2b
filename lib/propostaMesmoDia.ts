// ============================================================
// Proposta no mesmo dia (B2B) — GATILHO DE AGILIDADE, por closer, razão X/Y.
// Escopo = NEGÓCIOS EM ETAPAS ATIVAS, seguindo o filtro de tempo do painel
// (Data de criação), igual ao funil. Em "Todo o período" = todos os ativos.
//   #1 SEM REUNIÃO: dos ativos sem reunião, em quantos a proposta saiu no MESMO
//      DIA da qualificação. → enviou / teve.
//   #2 COM REUNIÃO: dos ativos com reunião, em quantos a proposta saiu no MESMO
//      DIA de alguma reunião. → enviou / teve.
// Data da proposta = 1º instante em que tem_proposta_anexada virou "true".
// Ignora usuário desativado (owner fora do map de ativos).
// ============================================================
import { hsFetch, sleep, dealUrl, ownerDisplayName, fetchAssocIds, REUNIOES_TIPOS_VENDA_LISTA, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const BR_OFFSET_MS = 3 * 60 * 60 * 1000; // GMT-3
const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  const ms = Number.isNaN(n) ? Date.parse(v) : n;
  return Number.isFinite(ms) ? ms : null;
};
// Reunião e a flag de proposta são datetimes → dia no fuso BR.
const dayKey = (ms: number | null): string | null => {
  if (ms == null) return null;
  const d = new Date(ms - BR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
// Qualificação é campo DATE (meia-noite UTC) → dia é a própria data UTC.
const dayUTC = (ms: number | null): string | null => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));

// status: no_dia = mandou no dia; fora = não mandou (janela já passou);
// aguardando = a janela ainda não chegou (reunião futura, ou qualificação hoje).
export type PMDStatus = "no_dia" | "fora" | "aguardando";
export type PMDDeal = { dealname: string; url: string; status: PMDStatus; criadoMs: number | null; propMs: number | null; reuniaoMs: number | null };
export type PMDCloser = {
  ownerId: string;
  nome: string;
  semComp: number; semElig: number; semAgu: number; // elig NÃO inclui aguardando
  comComp: number; comElig: number; comAgu: number;
  dealsSem: PMDDeal[]; dealsCom: PMDDeal[];
};
export type PropostaMesmoDiaData = {
  closers: PMDCloser[];
  totalSemComp: number; totalSemElig: number; totalSemAgu: number;
  totalComComp: number; totalComElig: number; totalComAgu: number;
};

type Filter = { propertyName: string; operator: string; value?: string; values?: string[] };

export async function fetchPropostaMesmoDia(
  config: SegmentConfig,
  opts: { from?: string; to?: string; owner?: string },
  owners: Map<string, Owner>,
  nomeMap: Map<string, string>
): Promise<PropostaMesmoDiaData> {
  const pipe = config.id === "b2c" ? "725182862" : "default";
  // 1) TODOS os negócios em ETAPAS ATIVAS (universo = funil ativo). O filtro de
  //    tempo é aplicado depois, pela data do EVENTO: qualificação (sem reunião)
  //    ou reunião (com reunião) — não pela data de criação. Assim "Ontem" mostra
  //    quem qualificou/teve reunião ontem (evento passado, sem "futura").
  const filters: Filter[] = [
    { propertyName: "pipeline", operator: "EQ", value: pipe },
    { propertyName: "dealstage", operator: "IN", values: config.stages.map((s) => s.id) },
  ];
  if (opts.owner) filters.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: opts.owner });

  const deals: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
      properties: ["dealname", "hubspot_owner_id", "pipedrive___data_de_qualificacao", "createdate"],
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

  const ids = deals.map((d) => d.id);

  // 2) Data da 1ª proposta anexada = 1º instante em que tem_proposta_anexada
  //    virou "true" (histórico). batch/read c/ histórico: máx 50 inputs.
  const firstProp = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await hsFetch<{ results?: { id: string; propertiesWithHistory?: { tem_proposta_anexada?: { value: string; timestamp: string }[] } }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ propertiesWithHistory: ["tem_proposta_anexada"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) {
      let firstTrue: number | null = null;
      for (const h of d.propertiesWithHistory?.tem_proposta_anexada ?? []) {
        if (h.value !== "true") continue;
        const t = Date.parse(h.timestamp);
        if (Number.isFinite(t) && (firstTrue == null || t < firstTrue)) firstTrue = t;
      }
      if (firstTrue != null) firstProp.set(d.id, firstTrue);
    }
    if (i + 50 < ids.length) await sleep(120);
  }

  // 3) Reuniões de cada negócio (define com/sem reunião) + data/hora de cada
  //    reunião (pra saber se já ocorreu ou é futura).
  const assoc = await fetchAssocIds("deals", "meetings", ids);
  const allM = [...new Set([...assoc.values()].flat())];
  const mInfo = new Map<string, { ms: number; day: string; tipo: string }>();
  for (let i = 0; i < allM.length; i += 100) {
    const chunk = allM.slice(i, i + 100);
    const mr = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `/crm/v3/objects/meetings/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: ["hs_meeting_start_time", "hs_activity_type"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const m of mr.results ?? []) {
      const ms = toMs(m.properties.hs_meeting_start_time);
      const dk = dayKey(ms);
      if (ms != null && dk) mInfo.set(m.id, { ms, day: dk, tipo: (m.properties.hs_activity_type || "").trim() });
    }
    if (i + 100 < allM.length) await sleep(120);
  }

  // Só REUNIÃO DE VENDA conta: tipo de venda do segmento, OU sem tipo desde que
  // seja a 1ª reunião do negócio (assume-se a de venda não-etiquetada). Tipos
  // não-venda (Relacionamento, FollowUp, CRM…) são ignorados.
  const salesTypes: Set<string> = config.id === "b2c"
    ? new Set(REUNIOES_TIPOS_VENDA_LISTA)
    : new Set(["B2B | Reunião de Venda", "B2B | Marcação IA"]);
  const meetsDeVendaDoNegocio = (dealId: string): { ms: number; day: string }[] => {
    const all = (assoc.get(dealId) ?? []).map((m) => mInfo.get(m)).filter(Boolean) as { ms: number; day: string; tipo: string }[];
    if (all.length === 0) return [];
    const firstMs = Math.min(...all.map((m) => m.ms));
    return all.filter((m) => salesTypes.has(m.tipo) || (m.tipo === "" && m.ms === firstMs));
  };

  // 4) Classifica por closer. Filtro de tempo pela data do EVENTO (dias
  //    "YYYY-MM-DD"; sem filtro = tudo).
  const now = Date.now();
  const todayKey = dayKey(now); // dia BR de hoje (janela ainda aberta)
  const fromDay = opts.from || null;
  const toDay = opts.to || null;
  const inPeriod = (day: string | null) => !!day && (!fromDay || (day >= fromDay && (!toDay || day <= toDay)));
  const nomeOf = (oid: string) => nomeMap.get(oid) || ownerDisplayName(owners.get(oid)) || "Sem closer";
  const byCloser = new Map<string, PMDCloser>();
  const get = (oid: string) => {
    if (!byCloser.has(oid)) byCloser.set(oid, { ownerId: oid, nome: nomeOf(oid), semComp: 0, semElig: 0, semAgu: 0, comComp: 0, comElig: 0, comAgu: 0, dealsSem: [], dealsCom: [] });
    return byCloser.get(oid)!;
  };
  for (const d of deals) {
    const oid = d.properties.hubspot_owner_id || "";
    if (!oid || !owners.has(oid)) continue; // usuário desativado
    const propMs = firstProp.get(d.id) ?? null;
    const propDay = dayKey(propMs); // flag = datetime → dia BR
    const qualDay = dayUTC(toMs(d.properties.pipedrive___data_de_qualificacao)); // campo DATE → dia UTC
    const meets = meetsDeVendaDoNegocio(d.id);
    const criadoMs = toMs(d.properties.createdate);
    const firstMeetMs = meets.length ? Math.min(...meets.map((m) => m.ms)) : null; // 1ª reunião do negócio
    const dl = (status: PMDStatus, reuniaoMs: number | null = firstMeetMs): PMDDeal => ({ dealname: d.properties.dealname || `Negócio ${d.id}`, url: dealUrl(d.id), status, criadoMs, propMs, reuniaoMs });
    const c = get(oid);
    if (meets.length > 0) {
      // COM REUNIÃO. O período seleciona o negócio pela data da reunião (entra se
      // tem reunião no recorte); mas o "no dia" é AGILIDADE REAL: a proposta saiu
      // no mesmo dia de QUALQUER reunião já realizada do negócio (não só a do
      // período). Exibe a reunião que casou com a proposta.
      const meetsWin = meets.filter((m) => inPeriod(m.day));
      if (meetsWin.length === 0) continue; // nenhuma reunião no período → fora do recorte
      const pastMeets = meets.filter((m) => m.ms < now);
      const match = propDay ? pastMeets.find((m) => m.day === propDay) : undefined;
      if (match) {
        c.comElig += 1; c.comComp += 1; c.dealsCom.push(dl("no_dia", match.ms));
      } else {
        // Sem casar. "fora" só se houve reunião do período num dia que JÁ ACABOU
        // (day < hoje) sem proposta no dia. Reunião de HOJE (mesmo já ocorrida) ou
        // futura → janela ainda aberta → aguardando (tag EM DIA / futura).
        const winPast = meetsWin.filter((m) => m.ms < now);
        const endedNoMatch = winPast.filter((m) => (m.day as string) < (todayKey as string));
        if (endedNoMatch.length > 0) {
          c.comElig += 1; c.dealsCom.push(dl("fora", Math.min(...endedNoMatch.map((m) => m.ms))));
        } else {
          const refMs = winPast.length ? Math.min(...winPast.map((m) => m.ms)) : Math.min(...meetsWin.map((m) => m.ms));
          c.comAgu += 1; c.dealsCom.push(dl("aguardando", refMs));
        }
      }
    } else {
      // SEM REUNIÃO. Evento = qualificação; só entra se a qualificação está no
      // período. no_dia se a proposta saiu no mesmo dia. Se qualificou HOJE e
      // ainda não mandou, o dia não acabou → aguardando (janela aberta), não fora.
      if (!inPeriod(qualDay)) continue;
      const ok = !!propDay && propDay === qualDay;
      if (ok) {
        c.semElig += 1; c.semComp += 1; c.dealsSem.push(dl("no_dia"));
      } else if (qualDay === todayKey) {
        c.semAgu += 1; c.dealsSem.push(dl("aguardando"));
      } else {
        c.semElig += 1; c.dealsSem.push(dl("fora"));
      }
    }
  }

  const sum = (f: (c: PMDCloser) => number) => [...byCloser.values()].reduce((s, c) => s + f(c), 0);
  const closers = [...byCloser.values()].sort((a, b) => (b.comElig + b.semElig + b.comAgu + b.semAgu) - (a.comElig + a.semElig + a.comAgu + a.semAgu));
  return {
    closers,
    totalSemComp: sum((c) => c.semComp), totalSemElig: sum((c) => c.semElig), totalSemAgu: sum((c) => c.semAgu),
    totalComComp: sum((c) => c.comComp), totalComElig: sum((c) => c.comElig), totalComAgu: sum((c) => c.comAgu),
  };
}
