import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchAllOwners, fetchCarteiraPerfilCompleto, type CarteiraPerfil } from "@/lib/farmer/hubspot";
import { resolveFarmers, type FarmerOverride } from "@/lib/farmer/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // snapshot pesado (~6k empresas) — só recomputa a cada 6h

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

// Carteira (perfil completo do tomador de decisão) é um snapshot que muda
// devagar → cacheia 6h por conjunto de owners. Roda separado do painel pra não
// travar o carregamento (é lento e some no rate limit do HubSpot).
const getCarteiraCached = (ownerIds: string[]) =>
  unstable_cache(
    () => fetchCarteiraPerfilCompleto(ownerIds),
    ["carteira-perfil-v1", [...ownerIds].sort().join(",")],
    { revalidate: 21600 }
  )();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (ACCESS_KEY) {
    if (url.searchParams.get("key") !== ACCESS_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const owners = await fetchAllOwners();
    const overrides = new Map<string, FarmerOverride>();
    const resolved = resolveFarmers(owners, overrides).filter((f) => !f.hidden);
    const ownerIds = resolved.map((f) => f.ownerId);
    const byOwner: CarteiraPerfil = await getCarteiraCached(ownerIds);
    return NextResponse.json({ byOwner });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[carteira]", message);
    // Não-fatal: devolve vazio pro card degradar sem quebrar o painel.
    return NextResponse.json({ byOwner: {}, warning: message });
  }
}
