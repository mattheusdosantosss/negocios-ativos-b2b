import { STAGES, STAGE_IDS, ownerDisplayName, dealUrl, type Deal, type Owner } from "./hubspot";

export type DealLite = {
  id: string;
  dealname: string;
  amount: number;
  createdate?: string;
  /** Vazio no modo de exemplo (sem HUBSPOT_TOKEN) — sem registro real no HubSpot. */
  url: string;
};

/** DealLite + nome do closer — usado nas listagens agregadas (todos os closers de uma etapa). */
export type AggregatedDealItem = DealLite & { ownerName: string };

// Faixas de tempo desde a Data de qualificação (mesmo campo usado nos outros
// painéis da PSA: pipedrive___data_de_qualificacao). Ciclo de vendas da PSA
// é de ~20-25 dias — "40+" é a faixa crítica (negócio muito além do ciclo).
export const AGING_BUCKETS: { id: string; label: string }[] = [
  { id: "0-20", label: "0–20 dias" },
  { id: "20-30", label: "20–30 dias" },
  { id: "30-40", label: "30–40 dias" },
  { id: "40+", label: "40+ dias" },
];
const AGING_BUCKET_IDS = AGING_BUCKETS.map((b) => b.id);
// Bucket extra pra negócio sem Data de qualificação preenchida — só aparece
// na UI se tiver algum caso (não é mostrado em AGING_BUCKETS).
const SEM_DATA_BUCKET = "sem-data";

function bucketForDays(days: number): string {
  if (days < 20) return "0-20";
  if (days < 30) return "20-30";
  if (days < 40) return "30-40";
  return "40+";
}

export type CloserRow = {
  ownerId: string;
  nome: string;
  porEtapa: Record<string, number>;
  valorPorEtapa: Record<string, number>;
  dealsPorEtapa: Record<string, DealLite[]>;
  porFaixa: Record<string, number>;
  dealsPorFaixa: Record<string, DealLite[]>;
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

function emptyStageDealsMap(): Record<string, DealLite[]> {
  return Object.fromEntries(STAGE_IDS.map((id) => [id, []]));
}

function emptyFaixaMap(): Record<string, number> {
  return Object.fromEntries([...AGING_BUCKET_IDS, SEM_DATA_BUCKET].map((id) => [id, 0]));
}

function emptyFaixaDealsMap(): Record<string, DealLite[]> {
  return Object.fromEntries([...AGING_BUCKET_IDS, SEM_DATA_BUCKET].map((id) => [id, []]));
}

export function aggregate(deals: Deal[], owners: Map<string, Owner>): Omit<DashboardData, "meta"> {
  const byOwner = new Map<string, CloserRow>();
  const now = Date.now();

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
        dealsPorEtapa: emptyStageDealsMap(),
        porFaixa: emptyFaixaMap(),
        dealsPorFaixa: emptyFaixaDealsMap(),
        total: 0,
        valor: 0,
      };
      byOwner.set(ownerId, row);
    }

    const dealLite: DealLite = {
      id: deal.id,
      dealname: deal.properties.dealname || `Negócio ${deal.id}`,
      amount,
      createdate: deal.properties.createdate,
      url: dealUrl(deal.id),
    };

    row.porEtapa[stage] += 1;
    row.valorPorEtapa[stage] += amount;
    row.dealsPorEtapa[stage].push(dealLite);
    row.total += 1;
    row.valor += amount;

    // Data de qualificação é property tipo "date" — a API do HubSpot devolve
    // como string "AAAA-MM-DD" (não epoch ms). new Date("AAAA-MM-DD") já
    // interpreta como meia-noite UTC, então dá pra converter direto.
    const qualDateRaw = deal.properties.pipedrive___data_de_qualificacao;
    const qualDate = qualDateRaw ? new Date(qualDateRaw).getTime() : NaN;
    const bucket = Number.isFinite(qualDate) && qualDate > 0
      ? bucketForDays(Math.floor((now - qualDate) / 86_400_000))
      : SEM_DATA_BUCKET;
    row.porFaixa[bucket] += 1;
    row.dealsPorFaixa[bucket].push(dealLite);
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

/** Todos os negócios ativos de um closer, juntando as 7 etapas (usado pela coluna Total/Valor). */
export function allDealsOf(row: CloserRow): DealLite[] {
  return STAGE_IDS.flatMap((id) => row.dealsPorEtapa[id]);
}

/** Todos os negócios de uma etapa, de TODOS os closers (usado pelo funil por etapa). */
export function dealsForStage(closers: CloserRow[], stageId: string): AggregatedDealItem[] {
  return closers.flatMap((c) =>
    (c.dealsPorEtapa[stageId] ?? []).map((d) => ({ ...d, ownerName: c.nome }))
  );
}
