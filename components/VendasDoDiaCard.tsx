"use client";

import { useMemo, useState } from "react";
import type { VendasDoDiaData, VendaItem, VendaDia } from "@/lib/vendasDia";

// produto_de_interesse pode ter vários produtos separados por ";".
const splitProd = (s?: string): string[] => (s ? s.split(";").map((x) => x.trim()).filter(Boolean) : []);

const num = (n: number) => n.toLocaleString("pt-BR");
// Percentual da venda = líquido ÷ bruto (fatia da PSA sobre o contrato). Só no B2B (bruto ≠ líq).
const pctLiq = (liq: number, bruto: number) => (bruto > 0 ? `${Math.round((liq / bruto) * 100)}%` : "");
const fmtK = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k` : `R$ ${num(n)}`;
const fmtDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
// Capitaliza só a 1ª letra de cada palavra (início / após espaço ou hífen).
// NÃO usar \b: em JS o \b trata acentos (ç, á) como fronteira e capitaliza a
// letra seguinte — vira "TerÇA-Feira" / "SÁBado".
const titleCase = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

// Rótulo do dia: "Quinta-Feira, 27 De Agosto", com "Hoje ·"/"Ontem ·" relativo.
function dayLabel(key: string): string {
  const d = new Date(key + "T12:00:00");
  const base = titleCase(d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }));
  const today = new Date();
  const k = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (key === k(today)) return `Hoje · ${base}`;
  if (key === k(yest)) return `Ontem · ${base}`;
  return base;
}

// Cor do valor por pipeline (B2B azul, B2C laranja — identidade PSA).
const VALUE = { b2b: "text-psa-blue", b2c: "text-psa-orange" } as const;

// Bloco de valor com rótulo em cima (Bruto / Líquido / Margem), pra bater o olho.
function Valor({ label, value, strong, caiu }: { label: string; value: string; strong?: string; caiu?: boolean }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-psa-muted">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${caiu ? "text-red-400 line-through" : strong || "text-psa-ink"}`}>{value}</span>
    </div>
  );
}

function Venda({ v }: { v: VendaItem }) {
  const caiu = v.status === "caiu";
  const temMargem = v.liquido !== v.bruto; // B2B: bruto ≠ líquido
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl border p-3 transition-colors ${
        caiu
          ? "border-red-300 bg-red-50 hover:bg-red-100/70"
          : "border-psa-line bg-psa-canvas/40 hover:border-psa-orange/40 hover:bg-psa-canvas/70"
      }`}
      title={caiu ? `Saiu do ganho · agora em "${v.currentStage}"` : "Abrir negócio no HubSpot"}
    >
      {/* Título do negócio */}
      <div className="flex items-start gap-2">
        {caiu && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ Caiu</span>
        )}
        <span className={`flex-1 min-w-0 text-[13px] font-semibold truncate ${caiu ? "text-psa-ink-soft" : "text-psa-ink"}`}>{v.dealname}</span>
      </div>

      {/* Valores discriminados */}
      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1.5">
        <Valor label={temMargem ? "Bruto" : "Valor"} value={fmtK(v.bruto)} strong={VALUE[v.seg]} caiu={caiu} />
        {temMargem && <Valor label="Líquido" value={fmtK(v.liquido)} caiu={caiu} />}
        {temMargem && <Valor label="Margem" value={pctLiq(v.liquido, v.bruto)} caiu={caiu} />}
        {caiu && <span className="text-[11px] text-red-600 font-medium self-center">→ {v.currentStage}</span>}
      </div>

      {/* Quem vendeu */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-psa-ink-soft">
        <span>Closer: <b className="text-psa-ink font-medium">{v.closer}</b></span>
        {v.sdrFarmer && <span>SDR/Farmer: <b className="text-psa-ink font-medium">{v.sdrFarmer}</b></span>}
      </div>

      {/* Palestrante / evento / produto */}
      {(v.palestrante || v.evento || v.produto || v.turma) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.palestrante && (
            <span className="text-[10px] font-medium text-psa-orange bg-psa-orange/10 rounded px-1.5 py-0.5 truncate max-w-full">🎤 {v.palestrante}</span>
          )}
          {v.evento && (
            <span className="text-[10px] text-psa-ink-soft bg-psa-surface border border-psa-line rounded px-1.5 py-0.5">📅 Evento {fmtDate(v.evento)}</span>
          )}
          {v.produto && (
            <span className="text-[10px] text-psa-ink-soft bg-psa-surface border border-psa-line rounded px-1.5 py-0.5 truncate max-w-full">{v.produto}</span>
          )}
          {v.turma && (
            <span className="text-[10px] text-psa-ink-soft bg-psa-surface border border-psa-line rounded px-1.5 py-0.5 truncate max-w-full">Turma {v.turma}</span>
          )}
        </div>
      )}
    </a>
  );
}

export default function VendasDoDiaCard({ data }: { data: VendasDoDiaData }) {
  const [produto, setProduto] = useState("all");

  // Lista de produtos distintos (do produto_de_interesse) pra alimentar o seletor.
  const produtos = useMemo(() => {
    const set = new Set<string>();
    for (const d of data.dias) for (const v of d.vendas) for (const p of splitProd(v.produto)) set.add(p);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data]);

  // Filtra por produto (client-side) e recalcula contagem/total (bruto+líq) só do produto.
  const view = useMemo(() => {
    if (produto === "all") return { dias: data.dias, count: data.count, total: data.total, totalLiq: data.totalLiq };
    const dias: VendaDia[] = [];
    let count = 0, total = 0, totalLiq = 0;
    for (const d of data.dias) {
      const vendas = d.vendas.filter((v) => splitProd(v.produto).includes(produto));
      if (vendas.length === 0) continue;
      let c = 0, t = 0, tL = 0;
      for (const v of vendas) if (v.status === "ganho") { c += 1; t += v.bruto; tL += v.liquido; }
      count += c; total += t; totalLiq += tL;
      dias.push({ key: d.key, count: c, total: t, totalLiq: tL, vendas });
    }
    return { dias, count, total, totalLiq };
  }, [data, produto]);

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-psa-ink-soft">
          Vendas do dia
          {produto !== "all" && (
            <span className="ml-2 text-psa-orange normal-case tracking-normal font-semibold">
              · {view.count} {view.count === 1 ? "venda" : "vendas"} de {produto} · {fmtK(view.total)}{view.totalLiq !== view.total && <span className="text-psa-muted font-normal"> (líq {fmtK(view.totalLiq)} · {pctLiq(view.totalLiq, view.total)})</span>}
            </span>
          )}
        </div>
        {/* Seletor de produto só no B2C (negócios B2B não têm produto_de_interesse). */}
        {produtos.length > 0 && (
          <select
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            className="rounded-lg border border-psa-line bg-psa-surface px-2.5 py-1.5 text-xs text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 max-w-[70%] sm:max-w-none"
            title="Filtrar por produto"
          >
            <option value="all">Todos os produtos</option>
            {produtos.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-[560px] overflow-y-auto px-5 pb-5">
        {view.dias.length === 0 ? (
          <div className="py-10 text-center text-sm text-psa-ink-soft">
            {produto === "all" ? "Nenhuma venda no período." : `Nenhuma venda de ${produto} no período.`}
          </div>
        ) : (
          view.dias.map((dia) => {
            const caiu = dia.vendas.filter((v) => v.status === "caiu").length;
            return (
            <div key={dia.key} className="pb-5">
              {/* Cabeçalho do dia fixo (sticky) durante o scroll */}
              <div className="sticky top-0 z-10 -mx-5 px-5 py-2.5 mb-3 bg-psa-surface/95 backdrop-blur-sm border-b border-psa-line flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-psa-ink">
                  <span className="inline-block w-1 h-4 rounded-full bg-psa-orange" />
                  {dayLabel(dia.key)}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-[11px] font-semibold text-psa-orange bg-psa-orange/10 rounded-full px-2.5 py-1">
                    {dia.count} {dia.count === 1 ? "venda" : "vendas"} · {fmtK(dia.total)}{dia.totalLiq !== dia.total && <span className="font-normal opacity-70"> líq {fmtK(dia.totalLiq)} · {pctLiq(dia.totalLiq, dia.total)}</span>}
                  </span>
                  {caiu > 0 && (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-100 rounded-full px-2.5 py-1">{caiu} caiu</span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dia.vendas.map((v, i) => (
                  <Venda key={i} v={v} />
                ))}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
