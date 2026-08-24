"use client";

import { useEffect, useState } from "react";
import type { TempoPropostaData, TempoPropostaFaixa } from "@/lib/hubspot";

const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: TempoPropostaData };

/**
 * Tempo (dias) da Data de qualificação até a 1ª entrada na etapa "Proposta
 * enviada" — mediana/média + distribuição em faixas. Segue o período (cohort de
 * propostas formalizadas no período).
 */
export default function TempoPropostaCard({ data }: Props) {
  const [open, setOpen] = useState<TempoPropostaFaixa | null>(null);
  const max = Math.max(1, ...data.faixas.map((f) => f.count));

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Tempo até a proposta</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(data.medianaDias)}d</span>
            <span className="text-sm text-psa-ink-soft">
              mediana · média <b className="text-psa-ink">{num(data.mediaDias)}d</b> ·{" "}
              <b className="text-psa-ink">{num(data.total)}</b> {data.total === 1 ? "negócio" : "negócios"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-psa-muted">
            Da Data de qualificação até entrar em “Proposta enviada” · negócios do closer · clique pra listar
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-psa-line flex flex-col gap-2">
        {data.faixas.map((f) => {
          const barW = (f.count / max) * 100;
          const pct = data.total > 0 ? (f.count / data.total) * 100 : 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={f.count > 0 ? () => setOpen(f) : undefined}
              disabled={f.count === 0}
              className="group flex items-center gap-3 text-left enabled:cursor-pointer"
              title={`${f.label}: ${num(f.count)}`}
            >
              <span className="text-[12px] text-psa-ink-soft truncate w-[80px] group-enabled:group-hover:text-psa-ink">{f.label}</span>
              <span className="flex-1 h-3 rounded bg-psa-canvas overflow-hidden">
                <span className="block h-full bg-psa-orange rounded transition-all" style={{ width: `${barW}%` }} />
              </span>
              <span className="text-[11px] text-psa-ink-soft tabular-nums w-[110px] text-right">
                <b className="text-psa-ink">{num(f.count)}</b> ·{" "}
                {pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </span>
            </button>
          );
        })}
      </div>

      {open && <TempoModal faixa={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TempoModal({ faixa, onClose }: { faixa: TempoPropostaFaixa; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Agrupado por closer.
  const groups = new Map<string, typeof faixa.deals>();
  for (const d of faixa.deals) {
    const k = d.closer || "Sem closer";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold">Tempo até a proposta · {faixa.label}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {num(faixa.deals.length)} {faixa.deals.length === 1 ? "negócio" : "negócios"}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/10">
          {ordered.map(([closer, ds]) => (
            <div key={closer} className="px-6 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white/90 truncate">{closer}</span>
                <span className="text-[11px] text-white/60 whitespace-nowrap">{ds.length} {ds.length === 1 ? "negócio" : "negócios"}</span>
              </div>
              <ul className="mt-1.5 pl-3 border-l-2 border-psa-orange/30 space-y-1">
                {ds.map((d, i) => (
                  <li key={i} className="text-[11px]">
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2" title="Abrir negócio no HubSpot">
                      <span className="flex-1 min-w-0 truncate text-white/75 group-hover:text-psa-orange group-hover:underline">{d.dealname}</span>
                      <span className="shrink-0 tabular-nums text-psa-orange font-semibold">{num(d.dias)}d</span>
                      <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
