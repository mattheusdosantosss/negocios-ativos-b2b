import { NextRequest, NextResponse } from "next/server";
import { getSegment } from "@/lib/segments";
import { isLeadSourceId } from "@/lib/leadSource";
import { getPropostaMesmoDiaCached } from "@/lib/dashboardCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Card "Proposta no mesmo dia" isolado num endpoint PRÓPRIO — é o mais pesado
// (busca qualificações + todas as reuniões do período + associações + histórico).
// Fora do /analytics ele não soma no portão de rate-limit compartilhado, então
// não empurra os outros cards pro timeout de 60s. O cliente busca em paralelo e
// faz merge. B2B only.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));
  const rawOrigem = url.searchParams.get("origem");
  const origemId = isLeadSourceId(rawOrigem) ? rawOrigem : "all";
  const rawOwner = url.searchParams.get("owner");
  const owner = config.team.some((m) => m.ownerId === rawOwner) ? (rawOwner as string) : undefined;

  if (!process.env.HUBSPOT_TOKEN || !config.hasPropostaMeeting) {
    return NextResponse.json({ propostaMesmoDia: undefined });
  }
  try {
    const raw = await getPropostaMesmoDiaCached(config, origemId, owner, from, to);
    return NextResponse.json({ propostaMesmoDia: raw?.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[proposta-mesmo-dia]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
