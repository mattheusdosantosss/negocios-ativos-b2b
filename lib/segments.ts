// ============================================================
// Segmentos do painel — B2B e B2C
// ============================================================
//
// Cada segmento é uma pipeline distinta do HubSpot com suas próprias etapas,
// etapas de ganho e roster de closers. Toda a config específica de segmento
// mora aqui; o resto do código (hubspot/aggregate/seed/page) recebe o
// SegmentConfig por parâmetro e não sabe se é B2B ou B2C.
//
// IMPORTANTE (B2B): nessa pipeline os IDs internos "closedwon"/"closedlost"
// foram renomeados pelo negócio para "Proposta enviada"/"Em negociação" — NÃO
// são os estágios terminais de ganho/perda do HubSpot, só reaproveitam o ID.

import { B2B_TEAM, B2C_TEAM, type TeamMember } from "./team";

export type SegmentId = "b2b" | "b2c";

export type StageDef = { id: string; label: string };

export type SegmentConfig = {
  id: SegmentId;
  /** Rótulo curto (aba/badge): "B2B" / "B2C". */
  label: string;
  /** Badge do topo: "PSA · Closers B2B". */
  eyebrow: string;
  /** Nome da pipeline no HubSpot, pro título do hero. */
  pipelineName: string;
  /** Etapas consideradas "negócio ativo" (em aberto no funil), na ordem. */
  stages: StageDef[];
  /** Etapas que entram na visão de Temperatura (B2B exclui "Resting"). */
  tempStageIds: string[];
  /** Etapas terminais de GANHO — base do "ticket médio de ganho". */
  wonStageIds: string[];
  /** Etapas de checkout/pagamento, exibidas num bloco à parte (fora do total
   *  de "ativos"). Vazio quando o segmento não tem essa fase. */
  checkoutStages: StageDef[];
  /** O segmento usa a "Data Prevista do Evento"? Se false, o bloco de Evento
   *  (atrasado / próximos 30 dias) some da seção Atenção. */
  hasEvento: boolean;
  /** Roster oficial de closers do segmento (métrica "fora do time"). */
  team: TeamMember[];
};

export const SEGMENTS: Record<SegmentId, SegmentConfig> = {
  b2b: {
    id: "b2b",
    label: "B2B",
    eyebrow: "PSA · Closers B2B",
    pipelineName: "Funil de Vendas B2B",
    // jul/2026: "Conexão" e "Aguardando Envio de Proposta" foram removidas.
    stages: [
      { id: "decisionmakerboughtin", label: "Reunião agendada / Qualificado" },
      { id: "closedwon", label: "Proposta enviada | 1° Follow" },
      { id: "closedlost", label: "Em negociação" },
      { id: "1167445770", label: "Negociação avançada" },
      { id: "1367665802", label: "Resting" },
    ],
    // Resting (1367665802) fica fora da leitura de temperatura (decisão jul/2026).
    tempStageIds: ["decisionmakerboughtin", "closedwon", "closedlost", "1167445770"],
    // Etapas terminais de ganho: "Negócio fechado" + "Ganho / Contrato assinado".
    wonStageIds: ["1076664462", "1076664460"],
    checkoutStages: [],
    hasEvento: true,
    team: B2B_TEAM,
  },
  b2c: {
    id: "b2c",
    label: "B2C",
    eyebrow: "PSA · Closers B2C",
    pipelineName: "Funil de Vendas B2C",
    // Ativas = 4 etapas comerciais (até "Negociação avançada"). "Aguardando
    // pagamento"/"Pagamento realizado" ficam no bloco de checkout.
    stages: [
      { id: "1057266721", label: "Reunião agendada / Qualificado" },
      { id: "1057266722", label: "Aguardando envio da proposta" },
      { id: "1275670104", label: "Em negociação" },
      { id: "1275670105", label: "Negociação avançada" },
    ],
    tempStageIds: ["1057266721", "1057266722", "1275670104", "1275670105"],
    // Ganho terminal do funil B2C.
    wonStageIds: ["1105295876"],
    checkoutStages: [
      { id: "1149710517", label: "Aguardando pagamento" },
      { id: "1057266725", label: "Pagamento realizado" },
    ],
    // B2C quase não usa "Data Prevista do Evento" — bloco de Evento fica fora.
    hasEvento: false,
    team: B2C_TEAM,
  },
};

export const DEFAULT_SEGMENT: SegmentId = "b2b";

export function isSegmentId(v: string | null | undefined): v is SegmentId {
  return v === "b2b" || v === "b2c";
}

/** Resolve um SegmentConfig a partir do ?segment= (cai no B2B se inválido). */
export function getSegment(v?: string | null): SegmentConfig {
  return isSegmentId(v) ? SEGMENTS[v] : SEGMENTS[DEFAULT_SEGMENT];
}

/** As etapas de temperatura, na ordem, resolvidas a partir do config. */
export function tempStagesOf(config: SegmentConfig): StageDef[] {
  return config.stages.filter((s) => config.tempStageIds.includes(s.id));
}

// Lista client-safe pro seletor de abas (não referencia env nem token).
export const SEGMENT_TABS: { id: SegmentId; label: string }[] = [
  { id: "b2b", label: "B2B" },
  { id: "b2c", label: "B2C" },
];
