"use client";

import { useEffect } from "react";
import type { DealLite } from "@/lib/aggregate";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ex.: "Rafael Teixeira" */
  closerName: string;
  /** Ex.: "Em negociação" ou "Todos os negócios ativos" */
  stageLabel: string;
  deals: DealLite[];
};

export default function DealListModal({ open, onClose, closerName, stageLabel, deals }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const total = deals.length;
  const valorTotal = deals.reduce((s, d) => s + d.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-modal-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="deal-modal-title" className="font-display text-xl font-bold truncate">
                {stageLabel}
              </h3>
              <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
                {closerName} · {total} {total === 1 ? "negócio" : "negócios"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {total > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Negócios</div>
                <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">{total}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Valor Total</div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(valorTotal)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {total === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhum negócio encontrado.</div>
          ) : (
            <ol className="divide-y divide-white/10">
              {deals.map((d, i) => {
                const hasLink = !!d.url;
                const content = (
                  <>
                    <span className="text-xs font-mono text-white/40 tabular-nums w-8">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm text-white/90 truncate ${
                          hasLink ? "group-hover:text-psa-orange group-hover:underline" : ""
                        }`}
                      >
                        {d.dealname}
                      </div>
                    </div>
                    {hasLink && <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>}
                    <div className="text-xs font-medium text-psa-orange tabular-nums whitespace-nowrap">
                      {brl(d.amount)}
                    </div>
                    <div className="text-xs text-white/60 tabular-nums whitespace-nowrap w-16 text-right">
                      {fmtDate(d.createdate)}
                    </div>
                  </>
                );

                return (
                  <li key={d.id} className="hover:bg-white/[0.03] transition-colors">
                    {hasLink ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group px-6 py-3 flex items-center gap-4"
                        title="Abrir negócio no HubSpot"
                      >
                        {content}
                      </a>
                    ) : (
                      <div
                        className="group px-6 py-3 flex items-center gap-4 opacity-80"
                        title="Dado de exemplo — sem registro real no HubSpot"
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
