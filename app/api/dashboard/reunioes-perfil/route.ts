import { NextRequest, NextResponse } from "next/server";
import { getSegment } from "@/lib/segments";
import { getReunioesPerfilCached } from "@/lib/dashboardCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint PRÓPRIO do card "Reuniões por closer" (B2C) — tem filtro de tempo
// exclusivo, independente do topo. O cliente busca aqui com o período escolhido
// no próprio card. Sem recorte por origem/owner (o card é por closer).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));

  if (!process.env.HUBSPOT_TOKEN || !config.hasReunioesPerfil) {
    return NextResponse.json({ reunioesPerfil: undefined });
  }
  try {
    const raw = await getReunioesPerfilCached(config, "all", [], undefined, from, to);
    return NextResponse.json({ reunioesPerfil: raw?.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[reunioes-perfil]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
