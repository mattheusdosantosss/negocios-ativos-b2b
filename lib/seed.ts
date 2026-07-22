// Snapshots ILUSTRATIVOS por segmento, usados como fallback quando o
// HUBSPOT_TOKEN não está configurado (dev local sem env, ou preview). Com o
// token, o painel fica ao vivo. Os números são aproximados de amostras reais
// (jul/2026) só pra os gráficos não ficarem vazios — não há registro
// individual real (url vazia).

import {
  AGING_BUCKETS,
  ACTIVITY_BUCKETS,
  EVENT_30D_BUCKETS,
  TEMPERATURE_IDS,
  PROPOSAL_TIME_BUCKETS,
  PROPOSAL_TIME_BUCKET_IDS,
} from "./aggregate";
import type {
  AggregatedDealItem,
  CheckoutData,
  CloserRow,
  DashboardData,
  DealLite,
  ProposalTimeData,
} from "./aggregate";
import { tempStagesOf, type SegmentConfig } from "./segments";

const AGING_BUCKET_IDS = AGING_BUCKETS.map((b) => b.id);
const ACTIVITY_BUCKET_IDS = ACTIVITY_BUCKETS.map((b) => b.id);
const EVENT_30D_BUCKET_IDS = EVENT_30D_BUCKETS.map((b) => b.id);

// ---- Especificação por segmento (só pro modo de exemplo) -------------------

type CloserSpec = { ownerId: string; nome: string; counts: number[]; valores: number[] };
type CheckoutStageSpec = { count: number; valor: number };

type SegmentSeedSpec = {
  /** counts/valores alinhados à ordem de config.stages. */
  closers: CloserSpec[];
  /** Uma linha por etapa de temperatura (ordem de config.tempStageIds), 5 temps. */
  tempRatiosByStage: number[][];
  agingRatios: number[]; // 0-20 / 20-30 / 30+
  activityRatios: number[]; // 0-2 / 3-5 / 6-10 / 11-15 / 16+
  eventoAtrasadoRatio: number;
  event30Ratios: number[]; // janelas 0-7 / 8-15 / 16-30 (do total)
  eventTempRatios: number[]; // temperatura dos eventos que chegam
  ganho: { count: number; valor: number };
  /** counts/valores alinhados à ordem de config.checkoutStages. */
  checkout?: CheckoutStageSpec[];
  /** Distribuição ilustrativa "tempo até a proposta" (faixas × temperatura). */
  proposalTime?: { total: number; bucketRatios: number[]; tempRatios: number[] };
};

function splitInts(total: number, ratios: number[]): number[] {
  const counts = ratios.map((r) => Math.round(total * r));
  const diff = total - counts.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const maxIdx = ratios.indexOf(Math.max(...ratios));
    counts[maxIdx] += diff;
  }
  return counts.map((c) => Math.max(0, c));
}

function fakeDeals(prefix: string, count: number, valorTotal: number, temp?: string): DealLite[] {
  const media = count > 0 ? valorTotal / count : 0;
  return Array.from({ length: count }, (_, j) => ({
    id: `demo-${prefix}-${j}`,
    dealname: `Negócio de exemplo ${prefix}.${j + 1}`,
    amount: media,
    valorLiquido: media * 0.9,
    createdate: "2026-06-20",
    qualdate: "2026-06-22",
    activitydate: "2026-07-07",
    eventdate: "2026-08-15",
    proposaldate: "2026-07-10",
    temp,
    url: "",
  }));
}

function fakeBucketSplit(bucketIds: string[], ratios: number[], total: number, valor: number) {
  const counts = ratios.map((r) => Math.round(total * r));
  const diff = total - counts.reduce((a, b) => a + b, 0);
  counts[0] += diff; // ajusta arredondamento na 1ª faixa

  const media = total > 0 ? valor / total : 0;
  const porBucket: Record<string, number> = { "sem-data": 0 };
  const dealsPorBucket: Record<string, DealLite[]> = { "sem-data": [] };
  bucketIds.forEach((id, i) => {
    porBucket[id] = counts[i];
    dealsPorBucket[id] = fakeDeals(id, counts[i], media * counts[i]);
  });
  return { porBucket, dealsPorBucket };
}

function makeRow(config: SegmentConfig, spec: SegmentSeedSpec, cs: CloserSpec): CloserRow {
  const stageIds = config.stages.map((s) => s.id);
  const tempStageIds = config.tempStageIds;
  const teamIds = new Set(config.team.map((m) => m.ownerId));
  const counts = cs.counts;
  const valores = cs.valores;
  const total = counts.reduce((a, b) => a + b, 0);
  const valor = valores.reduce((a, b) => a + b, 0);
  const media = total > 0 ? valor / total : 0;

  const aging = fakeBucketSplit(AGING_BUCKET_IDS, spec.agingRatios, total, valor);
  const atividade = fakeBucketSplit(ACTIVITY_BUCKET_IDS, spec.activityRatios, total, valor);
  const eventoAtrasado = Math.round(total * spec.eventoAtrasadoRatio);

  // Janela de evento (≤30 dias) × temperatura.
  const eventoProx30PorTemp: Record<string, Record<string, number>> = {};
  const dealsEventoProx30PorTemp: Record<string, Record<string, DealLite[]>> = {};
  const dealsEventoProximo30: DealLite[] = [];
  let eventoProximo30 = 0;
  EVENT_30D_BUCKET_IDS.forEach((bid, i) => {
    const janelaCount = Math.round(total * spec.event30Ratios[i]);
    eventoProximo30 += janelaCount;
    const split = splitInts(janelaCount, spec.eventTempRatios);
    eventoProx30PorTemp[bid] = Object.fromEntries(TEMPERATURE_IDS.map((tid, k) => [tid, split[k]]));
    dealsEventoProx30PorTemp[bid] = Object.fromEntries(
      TEMPERATURE_IDS.map((tid, k) => {
        const ds = fakeDeals(`${cs.ownerId}-ev${bid}-${tid}`, split[k], media * split[k]);
        dealsEventoProximo30.push(...ds);
        return [tid, ds];
      })
    );
  });

  // Matriz temperatura × etapa (só as etapas de temperatura do segmento).
  const tempPorEtapa: Record<string, Record<string, number>> = {};
  const dealsTempPorEtapa: Record<string, Record<string, DealLite[]>> = {};
  const dealsPorEtapaFromTemp: Record<string, DealLite[]> = {};
  tempStageIds.forEach((sid, ti) => {
    const stageCount = counts[stageIds.indexOf(sid)] ?? 0;
    const ratios = spec.tempRatiosByStage[ti] ?? [0, 0, 0, 0, 1];
    const split = splitInts(stageCount, ratios);
    tempPorEtapa[sid] = Object.fromEntries(TEMPERATURE_IDS.map((tid, k) => [tid, split[k]]));
    dealsTempPorEtapa[sid] = Object.fromEntries(
      TEMPERATURE_IDS.map((tid, k) => [
        tid,
        fakeDeals(`${cs.ownerId}-${sid}-${tid}`, split[k], media * split[k], tid),
      ])
    );
    dealsPorEtapaFromTemp[sid] = TEMPERATURE_IDS.flatMap((tid) => dealsTempPorEtapa[sid][tid]);
  });

  return {
    ownerId: cs.ownerId,
    nome: cs.nome,
    inTeam: teamIds.has(cs.ownerId),
    porEtapa: Object.fromEntries(stageIds.map((id, i) => [id, counts[i] ?? 0])),
    valorPorEtapa: Object.fromEntries(stageIds.map((id, i) => [id, valores[i] ?? 0])),
    dealsPorEtapa: Object.fromEntries(
      stageIds.map((id, i) => [
        id,
        // Etapas com matriz de temperatura reusam os deals já com temp; as
        // demais (ex.: Resting no B2B) geram deals soltos, sem temperatura.
        dealsPorEtapaFromTemp[id] ?? fakeDeals(String(i + 1), counts[i] ?? 0, valores[i] ?? 0),
      ])
    ),
    porFaixa: aging.porBucket,
    dealsPorFaixa: aging.dealsPorBucket,
    porAtividade: atividade.porBucket,
    dealsPorAtividade: atividade.dealsPorBucket,
    eventoAtrasado,
    dealsEventoAtrasado: fakeDeals(`${cs.ownerId}-atrasado`, eventoAtrasado, media * eventoAtrasado),
    eventoProximo30,
    dealsEventoProximo30,
    eventoProx30PorTemp,
    dealsEventoProx30PorTemp,
    tempPorEtapa,
    dealsTempPorEtapa,
    total,
    valor,
  };
}

function makeCheckout(config: SegmentConfig, specs?: CheckoutStageSpec[]): CheckoutData | undefined {
  if (config.checkoutStages.length === 0 || !specs) return undefined;
  const porEtapa: Record<string, number> = {};
  const valorPorEtapa: Record<string, number> = {};
  const dealsPorEtapa: Record<string, AggregatedDealItem[]> = {};
  let total = 0;
  let valor = 0;
  // Nomes só pra dar cara aos itens do popup no modo de exemplo.
  const nomes = config.team.map((m) => m.nome);
  config.checkoutStages.forEach((stage, i) => {
    const s = specs[i] ?? { count: 0, valor: 0 };
    porEtapa[stage.id] = s.count;
    valorPorEtapa[stage.id] = s.valor;
    dealsPorEtapa[stage.id] = fakeDeals(`checkout-${stage.id}`, s.count, s.valor).map((d, j) => ({
      ...d,
      ownerName: nomes.length ? nomes[j % nomes.length] : "Sem dono",
    }));
    total += s.count;
    valor += s.valor;
  });
  return { stages: config.checkoutStages, porEtapa, valorPorEtapa, dealsPorEtapa, total, valor };
}

function makeProposalTime(config: SegmentConfig, spec: SegmentSeedSpec): ProposalTimeData | undefined {
  if (!config.hasProposalTime || !spec.proposalTime) return undefined;
  const { total, bucketRatios, tempRatios } = spec.proposalTime;
  const bucketTotals = splitInts(total, bucketRatios);
  const nomes = config.team.map((m) => m.nome);
  const matrix: Record<string, Record<string, number>> = {};
  const dealsMap: Record<string, Record<string, AggregatedDealItem[]>> = {};
  PROPOSAL_TIME_BUCKET_IDS.forEach((bid, i) => {
    const split = splitInts(bucketTotals[i], tempRatios);
    matrix[bid] = Object.fromEntries(TEMPERATURE_IDS.map((tid, k) => [tid, split[k]]));
    dealsMap[bid] = Object.fromEntries(
      TEMPERATURE_IDS.map((tid, k) => [
        tid,
        fakeDeals(`prop-${bid}-${tid}`, split[k], split[k] * 1500, tid).map((d, j) => ({
          ...d,
          ownerName: nomes.length ? nomes[j % nomes.length] : "Sem dono",
        })),
      ])
    );
  });
  return { buckets: PROPOSAL_TIME_BUCKETS, matrix, deals: dealsMap, total };
}

function makeSeed(config: SegmentConfig, spec: SegmentSeedSpec): DashboardData {
  const stageIds = config.stages.map((s) => s.id);
  const tempStageIds = config.tempStageIds;

  const closers: CloserRow[] = spec.closers
    .map((cs) => makeRow(config, spec, cs))
    .sort((a, b) => b.total - a.total || b.valor - a.valor);

  const totals = {
    total: closers.reduce((s, c) => s + c.total, 0),
    valor: closers.reduce((s, c) => s + c.valor, 0),
    porEtapa: Object.fromEntries(stageIds.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])),
    foraDoTime: closers.filter((c) => !c.inTeam).reduce((s, c) => s + c.total, 0),
    eventoAtrasado: closers.reduce((s, c) => s + c.eventoAtrasado, 0),
    eventoProximo30: closers.reduce((s, c) => s + c.eventoProximo30, 0),
    eventoProx30PorTemp: Object.fromEntries(
      EVENT_30D_BUCKET_IDS.map((bid) => [
        bid,
        Object.fromEntries(
          TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.eventoProx30PorTemp[bid][tid], 0)])
        ),
      ])
    ),
    tempPorEtapa: Object.fromEntries(
      tempStageIds.map((sid) => [
        sid,
        Object.fromEntries(
          TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.tempPorEtapa[sid][tid], 0)])
        ),
      ])
    ),
    ganhoCount: spec.ganho.count,
    ganhoValor: spec.ganho.valor,
  };

  return {
    meta: {
      updatedAt: "2026-07-09T12:00:00.000Z",
      usingLiveData: false,
      segment: config.id,
      label: config.label,
      eyebrow: config.eyebrow,
      pipelineName: config.pipelineName,
    },
    stages: config.stages,
    tempStages: tempStagesOf(config),
    totals,
    closers,
    checkout: makeCheckout(config, spec.checkout),
    proposalTime: makeProposalTime(config, spec),
  };
}

// ---- Specs ilustrativas por segmento ---------------------------------------

// B2B: preserva os números do snapshot original (09/07/2026). counts/valores
// na ordem [Reunião agendada/Qualificado, Proposta enviada, Em negociação,
// Negociação avançada, Resting].
const B2B_SPEC: SegmentSeedSpec = {
  agingRatios: [0.53, 0.14, 0.33],
  activityRatios: [0.35, 0.25, 0.2, 0.1, 0.1],
  eventoAtrasadoRatio: 0.08,
  event30Ratios: [0.06, 0.05, 0.07],
  eventTempRatios: [0.15, 0.05, 0.5, 0.2, 0.1],
  tempRatiosByStage: [
    [0.05, 0, 0.25, 0.1, 0.6],
    [0.07, 0, 0.75, 0.18, 0],
    [0.15, 0.02, 0.55, 0.28, 0],
    [0.61, 0.33, 0.06, 0, 0],
  ],
  ganho: { count: 3919, valor: 58305753 },
  closers: [
    { ownerId: "80454586", nome: "Rafael Teixeira", counts: [10, 28, 38, 2, 13], valores: [21300, 147138, 240639.9, 27299, 48508] },
    { ownerId: "80651489", nome: "Catarina Varoni Borges", counts: [5, 14, 25, 4, 36], valores: [6320, 82899, 127706.1, 306998, 214237.1] },
    { ownerId: "80454588", nome: "João Gabriel Marins Pereira", counts: [4, 24, 32, 5, 20], valores: [1000, 137730, 208687, 14898, 102228] },
    { ownerId: "86859895", nome: "Mateus Mariano", counts: [10, 7, 41, 1, 9], valores: [21655, 70099.7, 271031.4, 3950, 21120] },
    { ownerId: "87159365", nome: "João Lucas Backmann", counts: [31, 6, 17, 1, 8], valores: [31800, 36200, 91025, 8750, 25400] },
    { ownerId: "80169395", nome: "Lucas Oliveira", counts: [6, 36, 5, 0, 7], valores: [0, 183515, 40220, 0, 34570] },
    { ownerId: "92704130", nome: "Talita Santos Cruz", counts: [10, 14, 12, 0, 3], valores: [8360, 69215, 86634.9, 0, 11000] },
    { ownerId: "80454576", nome: "Eduardo Vince", counts: [1, 7, 10, 0, 0], valores: [0, 43845, 55400, 0, 0] },
    // Fora do roster oficial B2B (farmer, SDR, ex-funcionário etc.).
    { ownerId: "79760745", nome: "Thiago Berto", counts: [5, 0, 0, 1, 0], valores: [10885, 0, 0, 8408, 0] },
    { ownerId: "81033487", nome: "Owner 81033487", counts: [7, 0, 0, 0, 0], valores: [14970, 0, 0, 0, 0] },
    { ownerId: "87074298", nome: "Owner 87074298", counts: [6, 0, 0, 0, 0], valores: [14000, 0, 0, 0, 0] },
    { ownerId: "80454577", nome: "Daniel Bento Sias", counts: [3, 0, 0, 1, 0], valores: [1000, 0, 0, 5950, 0] },
    { ownerId: "80454582", nome: "Katyeli Ceroni Madril", counts: [1, 1, 0, 0, 0], valores: [0, 28800, 0, 0, 0] },
    // Negócios sem dono resolvido.
    { ownerId: "sem-dono", nome: "Sem dono", counts: [2, 0, 0, 0, 0], valores: [0, 0, 0, 0, 0] },
  ],
};

// B2C: números ilustrativos próximos da volumetria real (jul/2026). counts na
// ordem [Reunião agendada/Qualificado, Aguardando envio da proposta, Em
// negociação, Negociação avançada]. No B2C o amount só enche mais pro fim do
// funil, então valor médio por etapa cresce nas etapas finais.
const B2C_AVG = [0, 1200, 1800, 3000];
const b2c = (ownerId: string, nome: string, counts: number[]): CloserSpec => ({
  ownerId,
  nome,
  counts,
  valores: counts.map((c, i) => c * (B2C_AVG[i] ?? 0)),
});

const B2C_SPEC: SegmentSeedSpec = {
  agingRatios: [0.62, 0.18, 0.2],
  activityRatios: [0.45, 0.25, 0.15, 0.08, 0.07],
  eventoAtrasadoRatio: 0.01,
  event30Ratios: [0.005, 0.003, 0.004],
  eventTempRatios: [0.25, 0.1, 0.45, 0.1, 0.1],
  // Cobertura de temperatura no B2C é menor: muita coisa "sem leitura".
  tempRatiosByStage: [
    [0.08, 0.01, 0.1, 0.01, 0.8],
    [0.2, 0.05, 0.2, 0.05, 0.5],
    [0.35, 0.08, 0.3, 0.12, 0.15],
    [0.45, 0.2, 0.2, 0.1, 0.05],
  ],
  ganho: { count: 1053, valor: 8558845 },
  checkout: [
    { count: 344, valor: 2333430 }, // Aguardando pagamento
  ],
  proposalTime: {
    total: 1050,
    bucketRatios: [0.72, 0.14, 0.09, 0.05], // 0-7 / 8-15 / 16-30 / 30+
    tempRatios: [0.2, 0.05, 0.15, 0.05, 0.55], // vv / forecast / cafe / larguei / sem_leitura
  },
  closers: [
    b2c("79760746", "Mayda Quadros", [70, 2, 12, 4]),
    b2c("88628309", "João Paulo da Silveira Araújo", [55, 1, 10, 3]),
    b2c("88628313", "Gabrielly Milani da Silva", [50, 2, 8, 2]),
    b2c("89632494", "Willker Santos Belous", [40, 1, 7, 3]),
    b2c("79760676", "Amanda de Oliveira", [45, 1, 6, 2]),
    b2c("93470034", "Franciele Oliveira", [20, 0, 3, 1]),
    b2c("81035544", "Camila Fay", [10, 0, 2, 1]),
    b2c("84249251", "Tércio Ferreira da Silva", [2, 0, 0, 0]),
    // Muito inbound de checkout entra sem dono resolvido.
    b2c("sem-dono", "Sem dono", [70, 5, 5, 2]),
  ],
};

const SPECS: Record<string, SegmentSeedSpec> = { b2b: B2B_SPEC, b2c: B2C_SPEC };

/** Snapshot de exemplo do segmento (fallback sem HUBSPOT_TOKEN). */
export function seedFor(config: SegmentConfig): DashboardData {
  return makeSeed(config, SPECS[config.id] ?? B2B_SPEC);
}
