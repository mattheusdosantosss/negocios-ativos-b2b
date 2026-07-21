// Snapshot real do HubSpot (pipeline "Funil de Vendas B2B") capturado em
// 09/07/2026, usado como fallback quando HUBSPOT_TOKEN não está configurado
// (dev local sem env, ou preview). Com o token, o painel fica ao vivo.

import { STAGES, TEMP_STAGE_IDS } from "./hubspot";
import { AGING_BUCKETS, ACTIVITY_BUCKETS, EVENT_30D_BUCKETS, TEMPERATURE_IDS } from "./aggregate";
import { B2B_TEAM_IDS } from "./team";
import type { CloserRow, DashboardData, DealLite } from "./aggregate";

// porEtapa/valorPorEtapa seguem a ordem de STAGES (5 etapas ativas):
// [Reunião agendada/Qualificado, Proposta enviada | 1° Follow,
//  Em negociação, Negociação avançada, Resting]
const STAGE_IDS = STAGES.map((s) => s.id);
const AGING_BUCKET_IDS = AGING_BUCKETS.map((b) => b.id);
const ACTIVITY_BUCKET_IDS = ACTIVITY_BUCKETS.map((b) => b.id);
const EVENT_30D_BUCKET_IDS = EVENT_30D_BUCKETS.map((b) => b.id);
// Proporções ilustrativas, próximas de amostras reais verificadas em jul/2026.
// Sem registro individual real — é só pra o modo de exemplo não ficar com os
// gráficos de faixa vazios.
const AGING_RATIOS = [0.53, 0.14, 0.33]; // 0-20 / 20-30 / 30+
const ACTIVITY_RATIOS = [0.35, 0.25, 0.2, 0.1, 0.1]; // 0-2 / 3-5 / 6-10 / 11-15 / 16+
const EVENTO_ATRASADO_RATIO = 0.08;
// Proporção dos negócios que caem em cada janela de evento ≤30 dias.
const EVENT_30D_RATIOS = [0.06, 0.05, 0.07]; // 0-7 / 8-15 / 16-30 (do total de negócios)
// Temperatura ilustrativa dos eventos que estão chegando.
const EVENT_TEMP_RATIOS = [0.15, 0.05, 0.5, 0.2, 0.1]; // vv / forecast / cafe / larguei / sem_leitura
// Temperatura por etapa (ordem: vou_vender / forecast / cafe / larguei / sem_leitura).
// Uma proporção ilustrativa por etapa das 4 ativas (convicção sobe no fim).
const TEMP_RATIOS_BY_STAGE = [
  [0.05, 0, 0.25, 0.1, 0.6], // Reunião agendada / Qualificado
  [0.07, 0, 0.75, 0.18, 0], // Proposta enviada | 1° Follow
  [0.15, 0.02, 0.55, 0.28, 0], // Em negociação
  [0.61, 0.33, 0.06, 0, 0], // Negociação avançada
];

function splitInts(total: number, ratios: number[]): number[] {
  const counts = ratios.map((r) => Math.round(total * r));
  const diff = total - counts.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    const maxIdx = ratios.indexOf(Math.max(...ratios));
    counts[maxIdx] += diff;
  }
  return counts.map((c) => Math.max(0, c));
}

// Negócio individual não é preservado no snapshot (só os totais agregados) —
// os itens abaixo são ilustrativos, sem registro real no HubSpot (url vazia).
function fakeDeals(prefix: string, count: number, valorTotal: number, temp?: string): DealLite[] {
  const media = count > 0 ? valorTotal / count : 0;
  // Datas ilustrativas fixas (snapshot 09/07/2026) só pra os popups do modo de
  // exemplo não ficarem cheios de "—". Com HUBSPOT_TOKEN vêm as datas reais.
  return Array.from({ length: count }, (_, j) => ({
    id: `demo-${prefix}-${j}`,
    dealname: `Negócio de exemplo ${prefix}.${j + 1}`,
    amount: media,
    valorLiquido: media * 0.9,
    createdate: "2026-06-20",
    qualdate: "2026-06-22",
    activitydate: "2026-07-07",
    eventdate: "2026-08-15",
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

function row(ownerId: string, nome: string, counts: number[], valores: number[]): CloserRow {
  const total = counts.reduce((a, b) => a + b, 0);
  const valor = valores.reduce((a, b) => a + b, 0);
  const media = total > 0 ? valor / total : 0;
  const aging = fakeBucketSplit(AGING_BUCKET_IDS, AGING_RATIOS, total, valor);
  const atividade = fakeBucketSplit(ACTIVITY_BUCKET_IDS, ACTIVITY_RATIOS, total, valor);
  const eventoAtrasado = Math.round(total * EVENTO_ATRASADO_RATIO);

  // Janela de evento (≤30 dias) × temperatura.
  const eventoProx30PorTemp: Record<string, Record<string, number>> = {};
  const dealsEventoProx30PorTemp: Record<string, Record<string, DealLite[]>> = {};
  const dealsEventoProximo30: DealLite[] = [];
  let eventoProximo30 = 0;
  EVENT_30D_BUCKET_IDS.forEach((bid, i) => {
    const janelaCount = Math.round(total * EVENT_30D_RATIOS[i]);
    eventoProximo30 += janelaCount;
    const split = splitInts(janelaCount, EVENT_TEMP_RATIOS);
    eventoProx30PorTemp[bid] = Object.fromEntries(TEMPERATURE_IDS.map((tid, k) => [tid, split[k]]));
    dealsEventoProx30PorTemp[bid] = Object.fromEntries(
      TEMPERATURE_IDS.map((tid, k) => {
        const ds = fakeDeals(`${ownerId}-ev${bid}-${tid}`, split[k], media * split[k]);
        dealsEventoProximo30.push(...ds);
        return [tid, ds];
      })
    );
  });

  // Matriz temperatura × etapa (só as 4 ativas, na ordem de TEMP_STAGE_IDS).
  // Guarda também os deals por etapa (concatenando as temperaturas) pra o
  // dealsPorEtapa carregar o temp certo em cada negócio (modo de exemplo).
  const tempPorEtapa: Record<string, Record<string, number>> = {};
  const dealsTempPorEtapa: Record<string, Record<string, DealLite[]>> = {};
  const dealsPorEtapaFromTemp: Record<string, DealLite[]> = {};
  TEMP_STAGE_IDS.forEach((sid, i) => {
    const stageCount = counts[i] || 0;
    const split = splitInts(stageCount, TEMP_RATIOS_BY_STAGE[i]);
    tempPorEtapa[sid] = Object.fromEntries(TEMPERATURE_IDS.map((tid, k) => [tid, split[k]]));
    dealsTempPorEtapa[sid] = Object.fromEntries(
      TEMPERATURE_IDS.map((tid, k) => [
        tid,
        fakeDeals(`${ownerId}-${sid}-${tid}`, split[k], media * split[k], tid),
      ])
    );
    dealsPorEtapaFromTemp[sid] = TEMPERATURE_IDS.flatMap((tid) => dealsTempPorEtapa[sid][tid]);
  });

  return {
    ownerId,
    nome,
    porEtapa: Object.fromEntries(STAGE_IDS.map((id, i) => [id, counts[i]])),
    valorPorEtapa: Object.fromEntries(STAGE_IDS.map((id, i) => [id, valores[i]])),
    dealsPorEtapa: Object.fromEntries(
      STAGE_IDS.map((id, i) => [
        id,
        // Etapas com matriz de temperatura reusam os deals já com temp; Resting
        // (fora da matriz) gera deals soltos, sem temperatura.
        dealsPorEtapaFromTemp[id] ?? fakeDeals(String(i + 1), counts[i], valores[i]),
      ])
    ),
    porFaixa: aging.porBucket,
    dealsPorFaixa: aging.dealsPorBucket,
    porAtividade: atividade.porBucket,
    dealsPorAtividade: atividade.dealsPorBucket,
    eventoAtrasado,
    dealsEventoAtrasado: fakeDeals(`${ownerId}-atrasado`, eventoAtrasado, media * eventoAtrasado),
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

const closers: CloserRow[] = [
  row("80454586", "Rafael Teixeira", [10, 28, 38, 2, 13], [21300, 147138, 240639.9, 27299, 48508]),
  row("80651489", "Catarina Varoni Borges", [5, 14, 25, 4, 36], [6320, 82899, 127706.1, 306998, 214237.1]),
  row("80454588", "João Gabriel Marins Pereira", [4, 24, 32, 5, 20], [1000, 137730, 208687, 14898, 102228]),
  row("86859895", "Mateus Mariano", [10, 7, 41, 1, 9], [21655, 70099.7, 271031.4, 3950, 21120]),
  row("87159365", "João Lucas Backmann", [31, 6, 17, 1, 8], [31800, 36200, 91025, 8750, 25400]),
  row("80169395", "Lucas Oliveira", [6, 36, 5, 0, 7], [0, 183515, 40220, 0, 34570]),
  row("92704130", "Talita Santos Cruz", [10, 14, 12, 0, 3], [8360, 69215, 86634.9, 0, 11000]),
  row("80454576", "Eduardo Vince", [1, 7, 10, 0, 0], [0, 43845, 55400, 0, 0]),
  // Fora do roster oficial B2B (farmer, SDR, ex-funcionário etc.) — cada um
  // mantém a própria linha, igual no HubSpot.
  row("79760745", "Thiago Berto", [5, 0, 0, 1, 0], [10885, 0, 0, 8408, 0]),
  row("81033487", "Owner 81033487", [7, 0, 0, 0, 0], [14970, 0, 0, 0, 0]),
  row("87074298", "Owner 87074298", [6, 0, 0, 0, 0], [14000, 0, 0, 0, 0]),
  row("80454577", "Daniel Bento Sias", [3, 0, 0, 1, 0], [1000, 0, 0, 5950, 0]),
  row("80454582", "Katyeli Ceroni Madril", [1, 1, 0, 0, 0], [0, 28800, 0, 0, 0]),
  // Negócios sem dono resolvido (sem hubspot_owner_id, ou owner desativado) —
  // compilados numa única linha "Sem dono".
  row("sem-dono", "Sem dono", [2, 0, 0, 0, 0], [0, 0, 0, 0, 0]),
].sort((a, b) => b.total - a.total || b.valor - a.valor);

const totals = {
  total: closers.reduce((s, c) => s + c.total, 0),
  valor: closers.reduce((s, c) => s + c.valor, 0),
  porEtapa: Object.fromEntries(
    STAGE_IDS.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])
  ),
  foraDoTimeB2B: closers.filter((c) => !B2B_TEAM_IDS.has(c.ownerId)).reduce((s, c) => s + c.total, 0),
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
    TEMP_STAGE_IDS.map((sid) => [
      sid,
      Object.fromEntries(
        TEMPERATURE_IDS.map((tid) => [tid, closers.reduce((s, c) => s + c.tempPorEtapa[sid][tid], 0)])
      ),
    ])
  ),
  // Ganhos ilustrativos (modo de exemplo): ticket médio de ganho ~R$ 14.900.
  ganhoCount: 3919,
  ganhoValor: 58305753,
};

export const SEED_DATA: DashboardData = {
  meta: { updatedAt: "2026-07-09T12:00:00.000Z", usingLiveData: false },
  stages: STAGES,
  totals,
  closers,
};
