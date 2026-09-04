import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aquece o Data Cache batendo as views mais acessadas (view padrão, sem filtro),
// pro 1º usuário do dia não pegar o cache vazio (cold ~2min → estoura o teto de
// 60s). Chamado pelo cron da Vercel (1×/dia no Hobby). Depois do 1º fill, o
// unstable_cache serve stale na hora e revalida em background — sem cliff.
//
// Protegido pelo CRON_SECRET: a Vercel injeta "Authorization: Bearer <secret>"
// nas invocações de cron quando essa env var existe.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  // View padrão dos dois segmentos = o que 99% dos acessos abrem primeiro.
  const targets = ["/api/dashboard?segment=b2b", "/api/dashboard?segment=b2c"];

  const started = Date.now();
  const warmed = await Promise.allSettled(
    targets.map((p) =>
      fetch(origin + p, { cache: "no-store" }).then((r) => ({ path: p, status: r.status }))
    )
  );

  return NextResponse.json({
    ms: Date.now() - started,
    warmed: warmed.map((r, i) =>
      r.status === "fulfilled" ? r.value : { path: targets[i], error: String(r.reason) }
    ),
  });
}
