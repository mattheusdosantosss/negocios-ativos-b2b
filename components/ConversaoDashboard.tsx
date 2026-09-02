"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { ConversaoData, ConvVertical, ConvCell } from "@/lib/conversao";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Acumulado por segmento (soma dos meses).
function acumPorSegmento(v: ConvVertical): Record<string, ConvCell> {
  const acc: Record<string, ConvCell> = {};
  for (const s of v.segmentos) acc[s] = { propostas: 0, vendas: 0, taxa: 0, receita: 0 };
  for (const m of v.meses) for (const s of v.segmentos) {
    acc[s].propostas += m.porSegmento[s]?.propostas ?? 0;
    acc[s].vendas += m.porSegmento[s]?.vendas ?? 0;
    acc[s].receita += m.porSegmento[s]?.receita ?? 0;
  }
  for (const s of v.segmentos) acc[s].taxa = acc[s].propostas > 0 ? acc[s].vendas / acc[s].propostas : 0;
  return acc;
}

export default function ConversaoDashboard({ segmentSelector }: { segmentSelector?: ReactNode }) {
  const [data, setData] = useState<ConversaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversao");
      const text = await res.text();
      let json: ConversaoData & { error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("O cálculo dos funis está demorando (varre ~5 mil negócios no 1º acesso). Clique em Atualizar de novo em alguns segundos.");
      }
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as ConversaoData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-12 w-[300px] h-[300px] rounded-full bg-psa-blue opacity-25" />
        <div aria-hidden className="pointer-events-none absolute top-0 right-0 h-full w-1.5 bg-psa-orange" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8 sm:min-h-[220px]">
          <div className="flex items-start justify-between gap-6 sm:gap-8 flex-wrap">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">PSA · Conversão</span>
              </div>
              <h1 className="font-display text-[28px] sm:text-[40px] leading-[1.05] font-extrabold tracking-tight text-white">
                Conversão
                <br />
                <span className="text-psa-orange">dos Funis.</span>
              </h1>
              <p className="mt-4 text-sm text-white/85 max-w-lg">
                Vendas ÷ propostas por vertical. Denominador montado por carimbos de etapa (proposta →
                em negociação → negociação avançada); ganhos sem rastro e perdidos sem proposta ficam fora.
              </p>
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-[200px] sm:shrink-0 rounded-xl bg-white/[0.06] border border-white/10 p-1">
              {segmentSelector}
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-white/[0.05] text-[13px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-60 disabled:cursor-wait"
              >
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-display font-semibold mb-1">Erro ao carregar</div>
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="rounded-2xl border border-psa-line bg-psa-surface p-8 text-center text-sm text-psa-ink-soft shadow-card">
          Calculando os funis ao vivo no HubSpot… (varre ~5 mil negócios, pode levar alguns segundos)
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <VerticalCard v={data.b2b} />
          <VerticalCard v={data.b2c} />
        </div>
      )}
    </main>
  );
}

function VerticalCard({ v }: { v: ConvVertical }) {
  const seg = acumPorSegmento(v);
  const maxTaxa = Math.max(0.001, ...v.meses.map((m) => m.total.taxa));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  return (
    <section className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      {/* Acumulado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">{v.label}</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(v.total.taxa)}</span>
            <span className="text-sm text-psa-ink-soft">
              <b className="text-psa-ink">{num(v.total.vendas)}</b> vendas ÷ <b className="text-psa-ink">{num(v.total.propostas)}</b> propostas
            </span>
          </div>
          <div className="mt-1 text-[11px] text-psa-muted">Acumulado no período · receita {brl(v.total.receita)}</div>
        </div>
      </div>

      {/* Por segmento (canal / produto) */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {v.segmentos.map((s) => (
          <div key={s} className="rounded-lg border border-psa-line bg-psa-canvas/40 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-psa-ink-soft truncate">{s}</div>
            <div className="mt-0.5 font-display text-lg font-bold text-psa-ink tabular-nums">{pct(seg[s].taxa)}</div>
            <div className="text-[10px] text-psa-muted tabular-nums">{num(seg[s].vendas)} / {num(seg[s].propostas)}</div>
          </div>
        ))}
      </div>

      {/* Mensal */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.06em] text-psa-ink-soft border-b border-psa-line">
              <th className="text-left py-2 pr-2">Mês</th>
              <th className="text-right py-2 px-2">Propostas</th>
              <th className="text-right py-2 px-2">Vendas</th>
              <th className="text-left py-2 pl-3 w-[42%]">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {v.meses.map((m) => {
              const isOpen = open.has(m.key);
              return (
                <Fragment key={m.key}>
                  <tr
                    onClick={() => toggle(m.key)}
                    className="border-b border-psa-line/60 cursor-pointer hover:bg-psa-canvas/40 transition-colors"
                    title="Ver detalhamento por segmento"
                  >
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <span className={`text-psa-orange text-[9px] inline-block w-2.5 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}>▼</span>{" "}
                      <span className="font-medium text-psa-ink">{m.label}</span>{" "}
                      <span className="text-[9px] uppercase tracking-wide text-psa-muted">{m.metodo === "janela" ? "· janela" : ""}</span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-psa-ink-soft">{num(m.total.propostas)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-psa-ink">{num(m.total.vendas)}</td>
                    <td className="py-2 pl-3">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 h-2.5 rounded-full bg-psa-canvas overflow-hidden">
                          <span className="block h-full rounded-full bg-psa-orange" style={{ width: `${(m.total.taxa / maxTaxa) * 100}%` }} />
                        </span>
                        <span className="w-12 text-right text-[11px] tabular-nums font-semibold text-psa-ink">{pct(m.total.taxa)}</span>
                      </div>
                    </td>
                  </tr>
                  {isOpen &&
                    v.segmentos.map((s) => {
                      const c = m.porSegmento[s];
                      return (
                        <tr key={m.key + s} className="bg-psa-canvas/30 text-[12px]">
                          <td className="py-1.5 pr-2 pl-6 text-psa-ink-soft">{s}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-psa-muted">{num(c.propostas)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(c.vendas)}</td>
                          <td className="py-1.5 pl-3 tabular-nums text-psa-ink-soft">{pct(c.taxa)}</td>
                        </tr>
                      );
                    })}
                  {isOpen && (
                    <tr className="bg-psa-canvas/30 text-[12px] border-b border-psa-line/60 font-semibold">
                      <td className="py-1.5 pr-2 pl-6 text-psa-ink uppercase text-[10px] tracking-wide">Total</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink">{num(m.total.propostas)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink">{num(m.total.vendas)}</td>
                      <td className="py-1.5 pl-3 tabular-nums text-psa-ink">{pct(m.total.taxa)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-psa-muted leading-relaxed">{v.nota}</div>
    </section>
  );
}
