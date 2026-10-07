// ============================================================
// SLA de Onboarding (B2B) — negócios parados na etapa "Aguardando Onboarding"
// há mais de N dias desde que entraram em "Negócio fechado". Mede o tempo de
// espera: se passou do prazo (7 dias), vira ATRASADO.
// ============================================================
import { hsFetch, sleep, dealUrl, ownerDisplayName, pipelineIdFor, type Owner } from "./hubspot";
import type { SegmentConfig } from "./segments";

const toMs = (v?: string): number | null => {
  if (!v) return null;
  const n = Number(v);
  const ms = Number.isNaN(n) ? Date.parse(v) : n;
  return Number.isFinite(ms) ? ms : null;
};

export type OnboardingDeal = {
  dealname: string;
  url: string;
  closer: string;
  fechouMs: number | null; // data de entrada em "Negócio fechado"
  dias: number | null; // dias desde que fechou
  atrasado: boolean;
};
export type OnboardingSLAData = {
  stageLabel: string;
  prazoDias: number;
  total: number;
  atrasados: number;
  noPrazo: number;
  deals: OnboardingDeal[];
};

export async function fetchOnboardingSLA(config: SegmentConfig, owners: Map<string, Owner>): Promise<OnboardingSLAData | undefined> {
  const sla = config.onboardingSLA;
  if (!sla) return undefined;
  const deals: { id: string; properties: Record<string, string> }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [
        { propertyName: "pipeline", operator: "EQ", value: pipelineIdFor(config) },
        { propertyName: "dealstage", operator: "EQ", value: sla.stageId },
      ] }],
      properties: ["dealname", "hubspot_owner_id", "closedate"],
      limit: 100,
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

  // Referência = a data MAIS ANTIGA em que o negócio entrou em "Negócio fechado"
  // OU em "Aguardando Onboarding", lida do HISTÓRICO do dealstage (o
  // hs_v2_date_entered pega só a última entrada, e a de AO vem vazia no HubSpot).
  const refEntry = new Map<string, number>();
  const ids = deals.map((d) => d.id);
  const stageVals = new Set([sla.refStageId, sla.stageId]);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await hsFetch<{ results?: { id: string; propertiesWithHistory?: { dealstage?: { value: string; timestamp: string }[] } }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ propertiesWithHistory: ["dealstage"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) {
      let minMs: number | null = null;
      for (const h of d.propertiesWithHistory?.dealstage ?? []) {
        if (!stageVals.has(h.value)) continue;
        const t = Date.parse(h.timestamp);
        if (Number.isFinite(t) && (minMs == null || t < minMs)) minMs = t;
      }
      if (minMs != null) refEntry.set(d.id, minMs);
    }
    if (i + 50 < ids.length) await sleep(120);
  }

  const now = Date.now();
  const items: OnboardingDeal[] = deals.map((d) => {
    const p = d.properties;
    const fechouMs = refEntry.get(d.id) ?? toMs(p.closedate); // fallback: closedate
    const dias = fechouMs != null ? Math.floor((now - fechouMs) / 86_400_000) : null;
    return {
      dealname: p.dealname || `Negócio ${d.id}`,
      url: dealUrl(d.id),
      closer: (p.hubspot_owner_id && ownerDisplayName(owners.get(p.hubspot_owner_id))) || "Sem closer",
      fechouMs,
      dias,
      atrasado: dias != null && dias > sla.prazoDias,
    };
  });
  items.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1)); // mais atrasado primeiro
  const atrasados = items.filter((i) => i.atrasado).length;
  return {
    stageLabel: sla.stageLabel,
    prazoDias: sla.prazoDias,
    total: items.length,
    atrasados,
    noPrazo: items.length - atrasados,
    deals: items,
  };
}
