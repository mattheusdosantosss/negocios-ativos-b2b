import { STAGES, STAGE_IDS, ownerDisplayName, type Deal, type Owner } from "./hubspot";

export type CloserRow = {
  ownerId: string;
  nome: string;
  porEtapa: Record<string, number>;
  valorPorEtapa: Record<string, number>;
  total: number;
  valor: number;
};

export type DashboardData = {
  meta: { updatedAt: string; usingLiveData: boolean };
  stages: { id: string; label: string }[];
  totals: { total: number; valor: number; porEtapa: Record<string, number> };
  closers: CloserRow[];
};

function emptyStageMap(): Record<string, number> {
  return Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
}

export function aggregate(deals: Deal[], owners: Map<string, Owner>): Omit<DashboardData, "meta"> {
  const byOwner = new Map<string, CloserRow>();

  for (const deal of deals) {
    const stage = deal.properties.dealstage;
    if (!stage || !STAGE_IDS.includes(stage)) continue;

    const ownerId = deal.properties.hubspot_owner_id || "sem-dono";
    const amount = Number(deal.properties.amount || 0) || 0;

    let row = byOwner.get(ownerId);
    if (!row) {
      row = {
        ownerId,
        nome: ownerId === "sem-dono" ? "Sem dono" : ownerDisplayName(owners.get(ownerId)),
        porEtapa: emptyStageMap(),
        valorPorEtapa: emptyStageMap(),
        total: 0,
        valor: 0,
      };
      byOwner.set(ownerId, row);
    }

    row.porEtapa[stage] += 1;
    row.valorPorEtapa[stage] += amount;
    row.total += 1;
    row.valor += amount;
  }

  const closers = [...byOwner.values()].sort(
    (a, b) => b.total - a.total || b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR")
  );

  const totals = {
    total: closers.reduce((s, c) => s + c.total, 0),
    valor: closers.reduce((s, c) => s + c.valor, 0),
    porEtapa: Object.fromEntries(
      STAGE_IDS.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])
    ),
  };

  return { stages: STAGES, totals, closers };
}
