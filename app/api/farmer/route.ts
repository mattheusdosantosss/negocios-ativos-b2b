import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllOwners,
  fetchDealsByQualification,
  fetchDealsByClose,
  fetchCsTramitacoesEmAndamento,
  fetchCsTramitacoesCriadas,
  fetchReunioesCriadas,
  isReuniaoRealizada,
  fetchCompanyOwnersForDeals,
  getDealStages,
  PIPELINE_CS_ATIVO,
  ORIGEM_CARTEIRA,
  ORIGEM_ACAO_CRM,
  ORIGEM_ACAO_CRM_CARTEIRA,
  ORIGEM_INDICACAO,
  ORIGEM_PALESTRANTE,
  ORIGEM_QUALIF_CARTEIRA,
} from "@/lib/farmer/hubspot";
import { aggregate, RevenueMode } from "@/lib/farmer/aggregate";
import { resolveFarmers, type FarmerOverride } from "@/lib/farmer/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  if (ACCESS_KEY) {
    const key = url.searchParams.get("key");
    if (key !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const modeRaw = url.searchParams.get("mode");
  const revenueMode: RevenueMode = modeRaw === "liquido" ? "liquido" : "bruto";

  // Origem — dropdown com 4 opções (default: carteira):
  //  carteira      → origem_do_lead "Carteira do Farmer"
  //  acao_crm      → origem_do_lead "Ação de CRM"
  //  qualif_farmer → origem_da_qualificacao "Farmer"
  //  todas         → as três (OR; HubSpot deduplica)
  const origemRaw = url.searchParams.get("origem");
  let origemLeadValues: string[];
  let origemQualValues: string[];
  switch (origemRaw) {
    case "acao_crm":
      origemLeadValues = [ORIGEM_ACAO_CRM];
      origemQualValues = [];
      break;
    case "acao_crm_carteira":
      origemLeadValues = [ORIGEM_ACAO_CRM_CARTEIRA];
      origemQualValues = [];
      break;
    case "indicacao":
      origemLeadValues = [ORIGEM_INDICACAO];
      origemQualValues = [];
      break;
    case "palestrante":
      origemLeadValues = [ORIGEM_PALESTRANTE];
      origemQualValues = [];
      break;
    case "qualif_farmer":
      origemLeadValues = [];
      origemQualValues = [ORIGEM_QUALIF_CARTEIRA];
      break;
    case "todas":
      origemLeadValues = [ORIGEM_CARTEIRA, ORIGEM_ACAO_CRM, ORIGEM_ACAO_CRM_CARTEIRA, ORIGEM_INDICACAO, ORIGEM_PALESTRANTE];
      origemQualValues = [ORIGEM_QUALIF_CARTEIRA];
      break;
    default: // carteira
      origemLeadValues = [ORIGEM_CARTEIRA];
      origemQualValues = [];
      break;
  }

  try {
    // 1) Owners + overrides → resolve a lista final de farmers (base + admin)
    // Sem admin/KV nesta versão: overrides sempre vazios, time vem do teams.ts.
    const owners = await fetchAllOwners();
    const overrides = new Map<string, FarmerOverride>();
    const resolved = resolveFarmers(owners, overrides).filter((f) => !f.hidden);
    const allowedOwnerIds = new Set(resolved.map((f) => f.ownerId));
    const squadByOwnerId = new Map(resolved.map((f) => [f.ownerId, f.squadId]));
    const ownerIds = Array.from(allowedOwnerIds);

    // Reuniões usam o ID de USUÁRIO (hs_created_by_user_id), não o ownerId.
    // Mapeia userId → ownerId pra atribuir a reunião ao farmer certo.
    const userIdToOwnerId = new Map<string, string>();
    for (const ownerId of allowedOwnerIds) {
      const owner = owners.get(ownerId);
      const uid = owner?.userId != null ? String(owner.userId) : ownerId; // fallback: userId == ownerId
      userIdToOwnerId.set(uid, ownerId);
    }
    const userIds = Array.from(userIdToOwnerId.keys());

    // 2) Deals em dois recortes + tickets de tramitação (snapshot).
    //    Sequencial pra evitar 429 quando há muitas páginas.
    const dealsQualificados = await fetchDealsByQualification({ from, to, ownerIds, origemLeadValues, origemQualValues });
    const dealsFechados = await fetchDealsByClose({ from, to, ownerIds, origemLeadValues, origemQualValues });

    // Negócios de Qualificação Farmer (lead ≠ Carteira/Ação) são creditados ao
    // Proprietário da empresa. Busca esse dono via associação deal→empresa.
    const precisaDono = (d: { properties: Record<string, string | undefined> }) =>
      d.properties.origem_da_qualificacao === ORIGEM_QUALIF_CARTEIRA &&
      d.properties.origem_do_lead !== ORIGEM_CARTEIRA &&
      d.properties.origem_do_lead !== ORIGEM_ACAO_CRM &&
      d.properties.origem_do_lead !== ORIGEM_INDICACAO &&
      d.properties.origem_do_lead !== ORIGEM_PALESTRANTE;
    const qualDealIds = Array.from(
      new Set([...dealsQualificados, ...dealsFechados].filter(precisaDono).map((d) => d.id))
    );
    const dealCompanyOwner = qualDealIds.length
      ? await fetchCompanyOwnersForDeals(qualDealIds)
      : new Map<string, string>();

    // Etapas (dealstage) pra rotular e ordenar o gráfico por etapa. Degrada
    // silenciosamente se falhar (gráfico usa os ids crus / sem ordem).
    let stageLabelById = new Map<string, string>();
    let stageOrder: string[] = [];
    try {
      const st = await getDealStages();
      stageLabelById = st.labelById;
      stageOrder = st.ordered.map((s) => s.label);
    } catch (e) {
      console.error("[dashboard] etapas indisponíveis:", e instanceof Error ? e.message : e);
    }
    const tickets = PIPELINE_CS_ATIVO
      ? await fetchCsTramitacoesEmAndamento({ ownerIds })
      : [];
    const ticketsCriados = PIPELINE_CS_ATIVO
      ? await fetchCsTramitacoesCriadas({ ownerIds, from, to })
      : [];

    // Reuniões — degrada com elegância se o token não tiver scope de meetings.
    type ReuniaoItem = { ownerId: string; id: string; title: string; date?: string; realizada: boolean };
    let reunioes: ReuniaoItem[] = [];
    let meetingsDisponivel = true;
    try {
      const meetings = await fetchReunioesCriadas({ userIds, from, to });
      for (const m of meetings) {
        const uid = m.properties.hs_created_by_user_id;
        const ownerId = uid ? userIdToOwnerId.get(String(uid)) : undefined;
        if (!ownerId) continue;
        reunioes.push({
          ownerId,
          id: m.id,
          title: m.properties.hs_meeting_title || "(sem título)",
          date: m.properties.hs_meeting_start_time || m.properties.hs_createdate || m.properties.createdate,
          realizada: isReuniaoRealizada(m),
        });
      }
    } catch (e) {
      meetingsDisponivel = false;
      console.error("[dashboard] reuniões indisponíveis:", e instanceof Error ? e.message : e);
    }

    const data = aggregate({
      dealsQualificados,
      dealsFechados,
      tickets,
      ticketsCriados,
      reunioes,
      meetingsDisponivel,
      owners,
      allowedOwnerIds,
      revenueMode,
      pipelineCsAtivo: PIPELINE_CS_ATIVO,
      squadByOwnerId,
      dealCompanyOwner,
      stageLabelById,
      stageOrder,
    });

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
