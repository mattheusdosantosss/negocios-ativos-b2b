import { NextRequest, NextResponse } from "next/server";
import { getSegment } from "@/lib/segments";
import { getConversaoVendaCached } from "@/lib/dashboardCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint PRÓPRIO do card "Conversão de reunião → venda" (B2C) — filtro de
// tempo exclusivo. Só faz sentido no B2C (mesma condição do card de reuniões).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const config = getSegment(url.searchParams.get("segment"));

  if (!process.env.HUBSPOT_TOKEN || !config.hasReunioesPerfil) {
    return NextResponse.json({ conversaoVenda: undefined });
  }
  try {
    const raw = await getConversaoVendaCached(config, from, to);
    return NextResponse.json({ conversaoVenda: raw?.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[conversao-venda]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
