import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchAllOwners, fetchCarteiraDetalheOwner, type CarteiraEmpresa } from "@/lib/farmer/hubspot";
import { resolveFarmers, type FarmerOverride } from "@/lib/farmer/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACCESS_KEY = process.env.DASHBOARD_ACCESS_KEY;

// Detalhe da carteira de UM farmer — lista de empresas + o que falta em cada.
// Sob demanda (ao clicar no card), cacheado 6h por owner.
const getDetalheCached = (ownerId: string) =>
  unstable_cache(
    () => fetchCarteiraDetalheOwner(ownerId),
    ["carteira-detalhe-v1", ownerId],
    { revalidate: 21600 }
  )();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (ACCESS_KEY && url.searchParams.get("key") !== ACCESS_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owner = url.searchParams.get("owner") || "";
  if (!owner) return NextResponse.json({ error: "owner obrigatório" }, { status: 400 });

  try {
    // Só aceita ownerId de um farmer do painel (evita varrer carteira alheia).
    const owners = await fetchAllOwners();
    const resolved = resolveFarmers(owners, new Map<string, FarmerOverride>()).filter((f) => !f.hidden);
    if (!resolved.some((f) => f.ownerId === owner)) {
      return NextResponse.json({ error: "owner fora do time" }, { status: 403 });
    }
    const companies: CarteiraEmpresa[] = await getDetalheCached(owner);
    return NextResponse.json({ companies });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[carteira/detalhe]", message);
    return NextResponse.json({ companies: [], warning: message });
  }
}
