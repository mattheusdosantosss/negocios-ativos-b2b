"use client";

import { useEffect, useState } from "react";
import type { ConversaoVendaData } from "@/lib/conversaoVenda";
import { PRESET_OPTIONS, PRESET_LABELS, computePeriod, type PeriodValue, type PeriodPreset } from "@/lib/periods";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * Conversão de reunião → venda (B2C), por closer. Card próprio, abaixo do
 * "Reuniões por closer". Filtro de tempo exclusivo (default: mês vigente).
 * Taxa = vendas do mês (ganhos fechados no período, com reunião de venda
 * realizada dos 5 tipos em qualquer data) ÷ reuniões de venda realizadas no mês.
 * Atribuição sempre pelo DONO DO NEGÓCIO. Pode passar de 100%.
 */
export default function ConversaoVendaCard({ segment }: { segment: "b2b" | "b2c" }) {
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("this_month"));
  const [data, setData] = useState<ConversaoVendaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams({ segment });
    if (period.from) qs.set("from", period.from);
    if (period.to) qs.set("to", period.to);
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dashboard/conversao-venda?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) { setData(j?.conversaoVenda ?? null); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [segment, period.preset, period.from, period.to]);

  const closers = data?.closers ?? [];
  const teamPct = data && data.totalReunioes > 0 ? (data.totalVendas / data.totalReunioes) * 100 : 0;

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Conversão de reunião → venda</div>
          {data && (
            <div className="mt-1 flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-4xl font-extrabold text-emerald-600 tabular-nums">{pct1(teamPct)}%</span>
              <span className="text-sm text-psa-ink-soft">
                {num(data.totalVendas)} vendas ÷ {num(data.totalReunioes)} reuniões realizadas
              </span>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-psa-ink-soft max-w-2xl">
            Vendas fechadas no período (com reunião de venda realizada dos 5 tipos, em qualquer data) ÷ reuniões de venda realizadas no período. A reunião conta sempre para o dono do negócio.
          </p>
        </div>
        {/* Filtro de tempo PRÓPRIO deste card */}
        <select
          value={period.preset}
          onChange={(e) => setPeriod(computePeriod(e.target.value as PeriodPreset))}
          className="shrink-0 rounded-lg border border-psa-line bg-psa-surface px-2.5 py-1.5 text-xs text-psa-ink focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          title="Período deste card"
        >
          {PRESET_OPTIONS.filter((p) => p !== "custom").map((p) => (
            <option key={p} value={p}>{PRESET_LABELS[p]}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="py-8 text-center text-sm text-psa-ink-soft">Carregando…</div>
        ) : closers.length === 0 ? (
          <div className="py-6 text-center text-sm text-psa-ink-soft">Nenhuma reunião de venda no período.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-psa-muted">
              <span className="flex-1">Closer</span>
              <span className="w-24 text-right">Vendas / reuniões</span>
              <span className="w-16 text-right">Conversão</span>
            </div>
            {closers.map((c) => {
              const p = c.reunioes > 0 ? (c.vendas / c.reunioes) * 100 : 0;
              const foraNumerador = c.ganhos - c.vendas;
              return (
                <div key={c.ownerId} className="flex items-center gap-3 rounded-lg border border-psa-line bg-psa-canvas/50 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-psa-ink truncate" title={c.nome}>{c.nome}</div>
                    <div className="text-[11px] text-psa-muted">
                      {num(c.ganhos)} ganhos no mês{foraNumerador > 0 ? ` · ${num(foraNumerador)} sem reunião de venda` : ""}
                    </div>
                  </div>
                  <div className="w-24 text-right text-[12px] tabular-nums text-psa-ink-soft">
                    <b className="text-psa-ink">{num(c.vendas)}</b> / {num(c.reunioes)}
                  </div>
                  <div className="w-16 text-right">
                    <span className="inline-block rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[13px] font-semibold text-emerald-700 tabular-nums">
                      {pct1(p)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
