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
  /** Etapa "Proposta enviada | 1° Follow" — denominador da taxa de conversão. */
  propostaStageId: string;
  /** Etapas terminais de GANHO — base do "ticket médio de ganho". */
  wonStageIds: string[];
  /** Etapas terminais de PERDA — usado no "tempo da reunião ao fechamento". */
  lostStageIds: string[];
  /** Etapas de checkout/pagamento, exibidas num bloco à parte (fora do total
   *  de "ativos"). Vazio quando o segmento não tem essa fase. */
  checkoutStages: StageDef[];
  /** O segmento usa a "Data Prevista do Evento"? Se false, o bloco de Evento
   *  (atrasado / próximos 30 dias) some da seção Atenção. */
  hasEvento: boolean;
  /** O segmento exibe o gráfico "Tempo da reunião ao fechamento" (dias da 1ª
   *  reunião concluída com closer até o negócio virar Ganho/Perdido)? */
  hasCloseTime: boolean;
  /** O segmento exibe o card "Conversão por macro tema" (win rate Ganho ÷
   *  fechados, por macro_tema, sobre os fechados dos closers)? Só B2B. */
  hasMacroTema: boolean;
  /** O segmento exibe o card "Proposta enviada → reunião" (% dos negócios com
   *  proposta anexada que tiveram reunião)? Só B2B. */
  hasPropostaMeeting: boolean;
  /** O segmento exibe o card "Motivos de perda" (distribuição de
   *  closed_lost_reason dos perdidos)? Só B2C. */
  hasLostReasons: boolean;
  /** Filtro único do denominador da conversão (B2B: tem_proposta_anexada=true;
   *  B2C: dealstage IN Ganho+Perdido). null quando se usa conversionDenomAnyOf. */
  conversionDenomFilter: { propertyName: string; operator: string; value?: string; values?: string[] } | null;
  /** Denominador mesclado (OR): negócio conta se tiver QUALQUER uma dessas
   *  propriedades preenchida (B2C: "chegou à proposta/negociação"). null = usa
   *  conversionDenomFilter. */
  conversionDenomAnyOf: string[] | null;
  /** Rótulo do denominador na UI. */
  conversionDenomLabel: string;
  /** Data que define o mês da taxa de conversão: "closedate" (por fechamento)
   *  ou "createdate" (por criação). */
  conversionDateProp: "closedate" | "createdate";
  /** O segmento exibe a seção "Negócios abertos por Closer" (lista por closer
   *  com gráfico de temperatura por etapa)? */
  hasCloserBreakdown: boolean;
  /** Meta de venda do mês (valor bruto), pro card "Meta do mês". null = sem meta. */
  monthGoal: number | null;
  /** Id da lista/segmento do HubSpot (dinâmica "MÊS") cujos negócios somam a
   *  venda do mês pra bater na meta. null quando o segmento não tem. */
  rankingListId: string | null;
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
    // "Proposta enviada | 1° Follow" reaproveita o id interno "closedwon".
    propostaStageId: "closedwon",
    // Etapas terminais de ganho: "Negócio fechado" + "Ganho / Contrato assinado".
    wonStageIds: ["1076664462", "1076664460"],
    lostStageIds: ["1076664461"],
    checkoutStages: [],
    hasEvento: true,
    hasCloseTime: false,
    hasMacroTema: true,
    hasPropostaMeeting: true,
    hasLostReasons: false,
    conversionDenomFilter: { propertyName: "tem_proposta_anexada", operator: "EQ", value: "true" },
    conversionDenomAnyOf: null,
    conversionDenomLabel: "só negócios com proposta anexada",
    conversionDateProp: "closedate",
    hasCloserBreakdown: false,
    monthGoal: 915_000,
    rankingListId: "1491", // "RANKING DE VENDAS | MÊS"
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
      { id: "1057266722", label: "Proposta enviada | 1° Follow" },
      { id: "1275670104", label: "Em negociação" },
      { id: "1275670105", label: "Negociação avançada" },
    ],
    tempStageIds: ["1057266721", "1057266722", "1275670104", "1275670105"],
    propostaStageId: "1057266722",
    // Ganho terminal do funil B2C.
    wonStageIds: ["1105295876"],
    lostStageIds: ["1059939760"],
    // Bloco de checkout removido a pedido (não é mais apresentado no B2C).
    checkoutStages: [],
    // B2C quase não usa "Data Prevista do Evento" — bloco de Evento fica fora.
    hasEvento: false,
    hasCloseTime: true,
    hasMacroTema: false,
    hasPropostaMeeting: false,
    hasLostReasons: true,
    // Conversão 100%: ganhos ÷ (ganhos + perdidos), todos os fechados. Os motivos
    // de perda (card "Motivos de perda") explicam o porquê das perdas.
    conversionDenomFilter: { propertyName: "dealstage", operator: "IN", values: ["1105295876", "1059939760"] },
    conversionDenomAnyOf: null,
    conversionDenomLabel: "",
    conversionDateProp: "closedate",
    hasCloserBreakdown: false,
    monthGoal: 664_000,
    rankingListId: "1491", // "RANKING DE VENDAS | MÊS" (filtra pela pipeline B2C)
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
