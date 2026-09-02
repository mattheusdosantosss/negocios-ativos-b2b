import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchConversao } from "@/lib/conversao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Funil pesado (varre ~5k negócios via Search) — cache de 1h, carregado só
// quando a aba Conversão é aberta.
const getConversaoCached = unstable_cache(async () => fetchConversao(), ["conversao-v9-b2b-diretas"], { revalidate: 3600 });

export async function GET() {
  try {
    const data = await getConversaoCached();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro ao carregar conversão" }, { status: 500 });
  }
}
