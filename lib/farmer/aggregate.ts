// ============================================================
// Agregação dos dados crus do HubSpot → KPIs do painel de líderes
// ============================================================
//
// Quatro métricas, sempre só de origem "Carteira do Farmer":
//   1. Demandas        — deals qualificados no período
//   2. Negócios fechados — deals ganhos (contrato) com fechamento no período
//   3. Receita          — soma do valor desses negócios fechados
//   4. Tramitações em andamento — tickets CS no backlog ao vivo (snapshot)
//
// Cada métrica carrega também a LISTA dos registros que a compõem
// (demandasDeals, negociosDeals, tramitacoesTickets) pra alimentar o
// drill-down: clicar no card/linha abre a lista com link pro HubSpot.

import {
  Deal,
  Ticket,
  Owner,
  GANHO_STAGES,
  ESTADO_FINAL_STAGES,
  STAGES,
  ORIGEM_CARTEIRA,
  ORIGEM_ACAO_CRM,
  ORIGEM_INDICACAO,
  ORIGEM_PALESTRANTE,
  ORIGEM_QUALIF_CARTEIRA,
  ownerDisplayName,
} from "./hubspot";
import { SQUADS, SquadId, squadOf, normalizeEmail } from "./teams";

export type RevenueMode = "bruto" | "liquido";

// Representação enxuta de um deal pra listagem no drill-down
export type DealLite = {
  id: string;
  dealname: string;
  amount: number;
  date?: string; // ISO — qualificação (demandas) ou fechamento (negócios)
  origemLead?: string; // Origem do lead do negócio (exposta no drill-down)
  stage?: string; // rótulo da etapa (dealstage) — usado no gráfico por etapa
  origemBucket?: "carteira" | "acao_crm" | "indicacao" | "palestrante" | "qualif_farmer"; // segmento do gráfico
  nota?: number; // pontuacao_leadscore (0–12)
  criteriosFaltantes?: string[]; // critérios que faltam pra nota máxima
};

// Critérios de qualificação (lead score) — valores exatos da enumeração
// criterios_atendidos no HubSpot. Os atendidos vêm separados por ";".
export const LEADSCORE_CRITERIOS = [
  "Reunião agendada",
  "Tempo de compra 45 dias",
  "Data do evento até 6 meses pós qualificação",
  "Histórico de contratação",
  "Qualificação completa (local, tema, público)",
  "Faixa de investimento informada",
];

// Negócio de "Qualificação Farmer" sem dono de empresa válido → vira alerta.
export type AlertaSemDono = {
  dealId: string;
  dealname: string;
};

// Representação enxuta de um ticket CS pra listagem no drill-down
export type TicketLite = {
  id: string;
  subject: string;
  date?: string; // ISO — criação do ticket
};

export type FarmerRow = {
  ownerId: string;
  email: string;
  nome: string;
  squadId: SquadId | null;
  demandas: number;
  demandasCarteira: number; // lead "Carteira do Farmer"
  demandasAcaoCrm: number; // lead "Ação de CRM"
  demandasIndicacao: number; // lead "Indicação"
  demandasPalestrante: number; // lead "Palestrante"
  demandasQualifFarmer: number; // qualif "Farmer" (e lead não é Carteira/Ação/Indicação/Palestrante)
  notaMedia: number; // média do lead score (0–12) das demandas com nota
  emAberto: number; // qualificados no período ainda na esteira (não-final)
  negocios: number; // negócios fechados (ganhos)
  perdidos: number; // fechados no período como perdido
  receita: number;
  tramitacoes: number; // tickets em andamento (snapshot ao vivo)
  tramitacoesCriadas: number; // tickets nessas etapas criados no período
  reunioesAgendadas: number; // reuniões criadas pelo farmer (B2B) no período
  reunioesRealizadas: number; // dessas, as com resultado "realizada"
  reunioesList: Array<{ id: string; title: string; date?: string; realizada: boolean }>;
  // Listas pro drill-down
  demandasDeals: DealLite[];
  emAbertoDeals: DealLite[];
  negociosDeals: DealLite[];
  perdidosDeals: DealLite[];
  tramitacoesTickets: TicketLite[];
  tramitacoesCriadasTickets: TicketLite[];
};

export type SquadStats = {
  id: SquadId;
  label: string;
  leader: string;
  demandas: number;
  emAberto: number;
  negocios: number;
  perdidos: number;
  semGanhos: number; // nº de farmers do squad sem nenhum negócio fechado
  receita: number;
  tramitacoes: number;
  tramitacoesCriadas: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
  farmers: FarmerRow[];
};

export type Totais = {
  demandas: number;
  emAberto: number;
  negocios: number;
  perdidos: number;
  semGanhos: number; // nº de farmers do escopo sem nenhum negócio fechado
  receita: number;
  tramitacoes: number;
  tramitacoesCriadas: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
};

export type DashboardData = {
  geral: Totais;
  squads: SquadStats[];
  /** Negócios de Qualificação Farmer sem dono de empresa válido (alerta dismissível). */
  alertasQualifSemDono: AlertaSemDono[];
  meta: {
    revenueMode: RevenueMode;
    pipelineCsAtivo: boolean;
    meetingsDisponivel: boolean;
    stageOrder: string[]; // rótulos das etapas B2B na ordem do funil (p/ gráfico)
    totalFarmers: number;
    updatedAt: string; // ISO datetime
  };
};

// Atribuição especial: negócio de qualificação "Farmer" cujo lead NÃO é
// Carteira nem Ação de CRM é creditado ao Proprietário da empresa.
function atribuiPorEmpresa(deal: Deal): boolean {
  const lead = deal.properties.origem_do_lead;
  return (
    deal.properties.origem_da_qualificacao === ORIGEM_QUALIF_CARTEIRA &&
    lead !== ORIGEM_CARTEIRA &&
    lead !== ORIGEM_ACAO_CRM &&
    lead !== ORIGEM_INDICACAO &&
    lead !== ORIGEM_PALESTRANTE
  );
}

// ============================================================
// Helpers
// ============================================================

/**
 * Valor monetário do deal conforme o modo:
 *  - bruto:   valor_total_do_contrato__bruto___ganho_ (só preenchido em ganhos)
 *  - liquido: amount (valor padrão do HubSpot)
 */
function parseAmount(deal: Deal, mode: RevenueMode): number {
  const raw =
    mode === "bruto"
      ? deal.properties.valor_total_do_contrato__bruto___ganho_
      : deal.properties.amount;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function isGanho(deal: Deal): boolean {
  const stage = deal.properties.dealstage;
  return !!stage && GANHO_STAGES.includes(stage);
}

function isPerdido(deal: Deal): boolean {
  return deal.properties.dealstage === STAGES.PERDIDO;
}

// Em aberto = ainda não chegou a um estágio final (nem ganho, nem perdido).
function isEmAberto(deal: Deal): boolean {
  const stage = deal.properties.dealstage;
  return !stage || !ESTADO_FINAL_STAGES.includes(stage);
}

// ============================================================
// Agregador principal
// ============================================================

export function aggregate(input: {
  /** Deals qualificados no período (origem carteira). Alimenta Demandas. */
  dealsQualificados: Deal[];
  /** Deals fechados/ganhos no período (origem carteira). Negócios + Receita. */
  dealsFechados: Deal[];
  /** Tickets CS em andamento (snapshot ao vivo). Tramitações em andamento. */
  tickets: Ticket[];
  /** Tickets CS nessas etapas criados no período. Tramitações criadas no mês. */
  ticketsCriados: Ticket[];
  /** Reuniões já filtradas (criadas por farmer no período, associadas a deal B2B). */
  reunioes: Array<{ ownerId: string; id: string; title: string; date?: string; realizada: boolean }>;
  /** False se a busca de reuniões falhou (ex.: token sem scope de meetings). */
  meetingsDisponivel: boolean;
  owners: Map<string, Owner>;
  allowedOwnerIds: Set<string>;
  revenueMode: RevenueMode;
  pipelineCsAtivo: boolean;
  /** Squad resolvido por ownerId (base + overrides do admin). Vence squadOf(email). */
  squadByOwnerId?: Map<string, SquadId>;
  /** dealId → ownerId do Proprietário da empresa (atribuição de Qualificação Farmer). */
  dealCompanyOwner?: Map<string, string>;
  /** dealstage id → rótulo legível (p/ o gráfico por etapa). */
  stageLabelById?: Map<string, string>;
  /** Rótulos das etapas B2B na ordem do funil. */
  stageOrder?: string[];
}): DashboardData {
  const {
    dealsQualificados,
    dealsFechados,
    tickets,
    ticketsCriados,
    reunioes,
    meetingsDisponivel,
    owners,
    allowedOwnerIds,
    revenueMode,
    pipelineCsAtivo,
    squadByOwnerId,
    dealCompanyOwner,
    stageLabelById,
    stageOrder,
  } = input;

  // NOTA: não há exclusão de "Fora do MOA" aqui — o painel conta exatamente o
  // que um filtro cru no HubSpot mostra (todos os estágios, todos os motivos
  // de perda). Se a operação decidir alinhar com o relatório oficial (que
  // ignora "Fora do MOA"), reintroduzir o filtro por closed_lost_reason.

  // Inicializa uma row zerada pra cada farmer permitido
  const byFarmer = new Map<string, FarmerRow>();
  for (const ownerId of allowedOwnerIds) {
    const owner = owners.get(ownerId);
    const email = normalizeEmail(owner?.email);
    byFarmer.set(ownerId, {
      ownerId,
      email,
      nome: ownerDisplayName(owner),
      squadId: squadByOwnerId?.get(ownerId) ?? squadOf(email),
      demandas: 0,
      demandasCarteira: 0,
      demandasAcaoCrm: 0,
      demandasIndicacao: 0,
      demandasPalestrante: 0,
      demandasQualifFarmer: 0,
      notaMedia: 0,
      emAberto: 0,
      negocios: 0,
      perdidos: 0,
      receita: 0,
      tramitacoes: 0,
      tramitacoesCriadas: 0,
      reunioesAgendadas: 0,
      reunioesRealizadas: 0,
      demandasDeals: [],
      emAbertoDeals: [],
      negociosDeals: [],
      perdidosDeals: [],
      tramitacoesTickets: [],
      tramitacoesCriadasTickets: [],
      reunioesList: [],
    });
  }

  // Alertas: negócios de Qualificação Farmer sem dono de empresa válido.
  const alertasMap = new Map<string, AlertaSemDono>();

  // Resolve a QUAL farmer o negócio pertence:
  // - Qualificação Farmer (lead ≠ Carteira/Ação) → Proprietário da empresa.
  // - Demais → SDR/Farmer Responsável.
  // Retorna undefined (e registra alerta, quando aplicável) se não houver
  // farmer válido do painel.
  const resolveRow = (deal: Deal): FarmerRow | undefined => {
    if (atribuiPorEmpresa(deal)) {
      const oid = dealCompanyOwner?.get(deal.id);
      const row = oid ? byFarmer.get(oid) : undefined;
      if (!row) {
        alertasMap.set(deal.id, {
          dealId: deal.id,
          dealname: deal.properties.dealname || "(sem nome)",
        });
      }
      return row;
    }
    const oid = deal.properties.sdrfarmer_responsavel;
    return oid ? byFarmer.get(oid) : undefined;
  };

  // Demandas (todos os qualificados no período) + Em aberto (os qualificados
  // que ainda não chegaram a estágio final).
  for (const deal of dealsQualificados) {
    const row = resolveRow(deal);
    if (!row) continue;
    // Bucket por origem (prioridade lead → qualificação; cada deal em 1 bucket):
    //  Carteira: lead "Carteira do Farmer" · Ação CRM: lead "Ação de CRM" ·
    //  Qualif. Farmer: qualificação "Farmer" quando o lead não é nenhum dos dois.
    const lead = deal.properties.origem_do_lead;
    const qual = deal.properties.origem_da_qualificacao;
    const bucket =
      lead === ORIGEM_CARTEIRA
        ? "carteira"
        : lead === ORIGEM_ACAO_CRM
        ? "acao_crm"
        : lead === ORIGEM_INDICACAO
        ? "indicacao"
        : lead === ORIGEM_PALESTRANTE
        ? "palestrante"
        : qual === ORIGEM_QUALIF_CARTEIRA
        ? "qualif_farmer"
        : undefined;
    const notaRaw = deal.properties.pontuacao_leadscore;
    const nota = notaRaw != null && notaRaw !== "" && Number.isFinite(Number(notaRaw)) ? Number(notaRaw) : undefined;
    const atendidos = (deal.properties.criterios_atendidos || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const lite: DealLite = {
      id: deal.id,
      dealname: deal.properties.dealname || "(sem nome)",
      amount: parseAmount(deal, revenueMode),
      date: deal.properties.pipedrive___data_de_qualificacao || deal.properties.createdate,
      origemLead: deal.properties.origem_do_lead,
      stage: stageLabelById?.get(deal.properties.dealstage ?? "") ?? deal.properties.dealstage,
      origemBucket: bucket,
      nota,
      criteriosFaltantes: LEADSCORE_CRITERIOS.filter((c) => !atendidos.includes(c)),
    };
    row.demandas += 1;
    if (bucket === "carteira") row.demandasCarteira += 1;
    else if (bucket === "acao_crm") row.demandasAcaoCrm += 1;
    else if (bucket === "indicacao") row.demandasIndicacao += 1;
    else if (bucket === "palestrante") row.demandasPalestrante += 1;
    else if (bucket === "qualif_farmer") row.demandasQualifFarmer += 1;
    row.demandasDeals.push(lite);
    if (isEmAberto(deal)) {
      row.emAberto += 1;
      row.emAbertoDeals.push(lite);
    }
  }

  // Negócios fechados + Receita (ganhos) e Perdidos — ambos por fechamento no período.
  for (const deal of dealsFechados) {
    const row = resolveRow(deal);
    if (!row) continue;
    if (isGanho(deal)) {
      const amount = parseAmount(deal, revenueMode);
      row.negocios += 1;
      row.receita += amount;
      row.negociosDeals.push({
        id: deal.id,
        dealname: deal.properties.dealname || "(sem nome)",
        amount,
        date: deal.properties.closedate,
        origemLead: deal.properties.origem_do_lead,
      });
    } else if (isPerdido(deal)) {
      row.perdidos += 1;
      row.perdidosDeals.push({
        id: deal.id,
        dealname: deal.properties.dealname || "(sem nome)",
        amount: parseAmount(deal, revenueMode),
        date: deal.properties.closedate,
        origemLead: deal.properties.origem_do_lead,
      });
    }
  }

  // Tramitações em andamento: 1 por ticket no snapshot ao vivo
  if (pipelineCsAtivo) {
    for (const ticket of tickets) {
      const ownerId = ticket.properties.hubspot_owner_id;
      if (!ownerId) continue;
      const row = byFarmer.get(ownerId);
      if (!row) continue;
      row.tramitacoes += 1;
      row.tramitacoesTickets.push({
        id: ticket.id,
        subject: ticket.properties.subject || "(sem assunto)",
        date: ticket.properties.createdate,
      });
    }

    // Tramitações criadas no período (mesmas etapas, recorte por createdate)
    for (const ticket of ticketsCriados) {
      const ownerId = ticket.properties.hubspot_owner_id;
      if (!ownerId) continue;
      const row = byFarmer.get(ownerId);
      if (!row) continue;
      row.tramitacoesCriadas += 1;
      row.tramitacoesCriadasTickets.push({
        id: ticket.id,
        subject: ticket.properties.subject || "(sem assunto)",
        date: ticket.properties.createdate,
      });
    }
  }

  // Reuniões: agendadas (todas) e realizadas (resultado "realizada").
  // A lista já vem filtrada (criadas pelo farmer no período + deal B2B).
  for (const r of reunioes) {
    const row = byFarmer.get(r.ownerId);
    if (!row) continue;
    row.reunioesAgendadas += 1;
    if (r.realizada) row.reunioesRealizadas += 1;
    row.reunioesList.push({ id: r.id, title: r.title, date: r.date, realizada: r.realizada });
  }

  // Nota média (lead score) por farmer — média das demandas que têm nota.
  for (const row of byFarmer.values()) {
    const scored = row.demandasDeals.filter((d) => typeof d.nota === "number");
    row.notaMedia = scored.length ? scored.reduce((s, d) => s + (d.nota ?? 0), 0) / scored.length : 0;
  }

  const farmers = Array.from(byFarmer.values());

  // Agregação por squad (farmers ordenados por receita desc dentro do squad)
  const squads: SquadStats[] = SQUADS.map((s) => {
    const members = farmers
      .filter((f) => f.squadId === s.id)
      .sort((a, b) => b.receita - a.receita || b.negocios - a.negocios || b.demandas - a.demandas);
    return {
      id: s.id,
      label: s.label,
      leader: s.leader,
      farmers: members,
      demandas: members.reduce((sum, f) => sum + f.demandas, 0),
      emAberto: members.reduce((sum, f) => sum + f.emAberto, 0),
      negocios: members.reduce((sum, f) => sum + f.negocios, 0),
      perdidos: members.reduce((sum, f) => sum + f.perdidos, 0),
      semGanhos: members.filter((f) => f.negocios === 0).length,
      receita: members.reduce((sum, f) => sum + f.receita, 0),
      tramitacoes: members.reduce((sum, f) => sum + f.tramitacoes, 0),
      tramitacoesCriadas: members.reduce((sum, f) => sum + f.tramitacoesCriadas, 0),
      reunioesAgendadas: members.reduce((sum, f) => sum + f.reunioesAgendadas, 0),
      reunioesRealizadas: members.reduce((sum, f) => sum + f.reunioesRealizadas, 0),
    };
  });

  const geral: Totais = {
    demandas: farmers.reduce((s, f) => s + f.demandas, 0),
    emAberto: farmers.reduce((s, f) => s + f.emAberto, 0),
    negocios: farmers.reduce((s, f) => s + f.negocios, 0),
    perdidos: farmers.reduce((s, f) => s + f.perdidos, 0),
    semGanhos: farmers.filter((f) => f.negocios === 0).length,
    receita: farmers.reduce((s, f) => s + f.receita, 0),
    tramitacoes: farmers.reduce((s, f) => s + f.tramitacoes, 0),
    tramitacoesCriadas: farmers.reduce((s, f) => s + f.tramitacoesCriadas, 0),
    reunioesAgendadas: farmers.reduce((s, f) => s + f.reunioesAgendadas, 0),
    reunioesRealizadas: farmers.reduce((s, f) => s + f.reunioesRealizadas, 0),
  };

  return {
    geral,
    squads,
    alertasQualifSemDono: Array.from(alertasMap.values()),
    meta: {
      revenueMode,
      pipelineCsAtivo,
      meetingsDisponivel,
      stageOrder: stageOrder ?? [],
      totalFarmers: farmers.length,
      updatedAt: new Date().toISOString(),
    },
  };
}
