import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchAllDeals } from "@/lib/farmer2/hubspot";
import { FARMERS } from "@/lib/farmer2/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dados crus do painel de Farmer (espelho do farmers-dashboard). O cliente
// computa os cards (ranking/score/critérios/conversão/etc.) a partir disso,
// igual ao externo. wonDeals = negócios ganhos (receita), filtrados por período no cliente.
// A lista de farmers entra na chave: quem é adicionado ou removido aparece
// no próximo deploy, sem esperar o cache antigo (que sobrevive ao deploy).
const getFarmer2 = unstable_cache(
  async () => fetchAllDeals(),
  ["farmer2-deals-v2", Object.keys(FARMERS).sort().join(",")],
  { revalidate: 600 }
);

export async function GET() {
  if (!process.env.HUBSPOT_TOKEN) {
    return NextResponse.json({ error: "HUBSPOT_TOKEN não configurado" }, { status: 500 });
  }
  try {
    return NextResponse.json(await getFarmer2());
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[farmer2]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
