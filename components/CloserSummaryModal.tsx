"use client";

import { useEffect } from "react";
import type { CloserRow } from "@/lib/aggregate";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = {
  open: boolean;
  onClose: () => void;
  rows: CloserRow[];
};

export default function CloserSummaryModal({ open, onClose, rows }: Props) {
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

  const ordenados = [...rows].sort((a, b) => b.total - a.total || b.valor - a.valor);
  const totalNegocios = ordenados.reduce((s, c) => s + c.total, 0);
  const totalValor = ordenados.reduce((s, c) => s + c.valor, 0);
  const totalAtrasado = ordenados.reduce((s, c) => s + c.eventoAtrasado, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="closer-summary-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="closer-summary-title" className="font-display text-xl font-bold truncate">
                Closers com negócios ativos
              </h3>
              <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
                {ordenados.length} {ordenados.length === 1 ? "closer" : "closers"} do time B2B
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

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="bg-white/5 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Negócios</div>
              <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">
                {num(totalNegocios)}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Valor em aberto</div>
              <div className="mt-1 font-display text-lg font-bold text-psa-orange tabular-nums whitespace-nowrap">
                {brl(totalValor)}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Evento atrasado</div>
              <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">
                {num(totalAtrasado)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {ordenados.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhum closer com negócio ativo.</div>
          ) : (
            <>
              <div className="px-6 py-2 flex items-center gap-4 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/40 sticky top-0 bg-psa-ink z-10">
                <span className="w-8">#</span>
                <span className="flex-1">Closer</span>
                <span className="w-16 text-right">Negócios</span>
                <span className="w-28 text-right">Valor</span>
                <span className="w-20 text-right">Evento atras.</span>
              </div>
              <ol className="divide-y divide-white/10">
                {ordenados.map((c, i) => (
                  <li key={c.ownerId} className="px-6 py-3 flex items-center gap-4">
                    <span className="text-xs font-mono text-white/40 tabular-nums w-8">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0 text-sm text-white/90 truncate">{c.nome}</div>
                    <div className="w-16 text-right text-sm font-bold text-psa-orange tabular-nums">
                      {num(c.total)}
                    </div>
                    <div className="w-28 text-right text-xs text-white/80 tabular-nums whitespace-nowrap">
                      {brl(c.valor)}
                    </div>
                    <div
                      className={`w-20 text-right text-sm font-bold tabular-nums ${
                        c.eventoAtrasado > 0 ? "text-psa-orange" : "text-white/30"
                      }`}
                    >
                      {num(c.eventoAtrasado)}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
