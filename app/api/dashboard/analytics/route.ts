import { NextRequest, NextResponse } from "next/server";
import { type DashboardData, type ConversionData } from "@/lib/aggregate";
import { getSegment } from "@/lib/segments";
import { isLeadSourceId, leadSourceValues } from "@/lib/leadSource";
import { seedFor } from "@/lib/seed";
import {
  getConversionCached,
  getPropostaMeetingCached,
  getLostReasonsCached,
  getTempoPropostaCached,
  getGanhosAtributosCached,
  getLeadTimeGanhosCached,
  getVendasDoDiaCached,
} from "@/lib/dashboardCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cards analíticos pesados do dashboard — 2ª fase. O cliente busca isto em
// paralelo ao núcleo (/api/dashboard) e faz merge quando chega. Cada card é
// cacheado; nenhum bloqueia o núcleo. Só os campos analíticos vêm aqui.
export type AnalyticsData = Pick<
  DashboardData,
  | "conversion"
  | "propostaMeeting"
  | "motivos"
  | "tempoProposta"
  | "ganhosAtributos"
  | "leadTimeGanhos"
  | "vendasDoDia"
>;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));
  const rawOrigem = url.searchParams.get("origem");
  const origemId = isLeadSourceId(rawOrigem) ? rawOrigem : "all";
  const origem = leadSourceValues(origemId);
  const rawOwner = url.searchParams.get("owner");
  const owner = config.team.some((m) => m.ownerId === rawOwner) ? (rawOwner as string) : undefined;

  if (!process.env.HUBSPOT_TOKEN) {
    const s = seedFor(config);
    const seed: AnalyticsData = {
      conversion: s.conversion,
      propostaMeeting: s.propostaMeeting,
      motivos: s.motivos,
      tempoProposta: s.tempoProposta,
      ganhosAtributos: s.ganhosAtributos,
      leadTimeGanhos: s.leadTimeGanhos,
      vendasDoDia: s.vendasDoDia,
    };
    return NextResponse.json(seed);
  }

  try {
    const [vendasDiaRaw, convRaw, propMeetRaw, motivosRaw, tempoPropRaw, ganhosAtribRaw, leadTimeRaw] = await Promise.all([
      getVendasDoDiaCached(config, from, to),
      getConversionCached(config, origemId, origem, owner).catch(
        (e): { data: ConversionData | undefined; warning?: string } => ({ data: undefined, warning: e instanceof Error ? e.message : "erro ao carregar conversão" })
      ),
      config.hasPropostaMeeting ? getPropostaMeetingCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasLostReasons ? getLostReasonsCached(config, origemId, origem, owner) : Promise.resolve(null),
      config.hasTempoProposta ? getTempoPropostaCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasGanhoCards ? getGanhosAtributosCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
      config.hasGanhoCards ? getLeadTimeGanhosCached(config, origemId, origem, owner, from, to) : Promise.resolve(null),
    ]);

    const data: AnalyticsData = {
      conversion: convRaw?.data,
      propostaMeeting: propMeetRaw?.data,
      motivos: motivosRaw?.data,
      tempoProposta: tempoPropRaw?.data,
      ganhosAtributos: ganhosAtribRaw?.data,
      leadTimeGanhos: leadTimeRaw?.data,
      vendasDoDia: vendasDiaRaw?.data,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[dashboard/analytics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
