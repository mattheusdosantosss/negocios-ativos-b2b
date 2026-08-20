"use client";

import { useEffect } from "react";
import type { CarteiraEmpresa } from "@/lib/farmer/hubspot";

type Props = {
  open: boolean;
  onClose: () => void;
  scopeLabel: string;
  filter: "completos" | "pendentes";
  /** null = ainda carregando (fetch on-demand). */
  companies: CarteiraEmpresa[] | null;
};

export default function CarteiraModal({ open, onClose, scopeLabel, filter, companies }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const loading = companies == null;
  const lista = (companies ?? []).filter((c) => (filter === "completos" ? c.completo : !c.completo));
  const titulo = filter === "completos" ? "Perfil completo" : "Perfil a completar";
  const sing = "empresa";
  const plural = "empresas";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold">{titulo}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {scopeLabel} · {loading ? "carregando…" : `${lista.length} ${lista.length === 1 ? sing : plural}`}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center text-sm text-white/60">Carregando carteira (snapshot)…</div>
          ) : lista.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhuma empresa.</div>
          ) : (
            <ol className="divide-y divide-white/10">
              {lista.map((c, i) => (
                <li key={`${c.name}-${i}`} className="px-6 py-3 flex items-start gap-4">
                  <span className="text-xs font-mono text-white/40 tabular-nums w-8 pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/90 truncate">{c.name}</div>
                    {filter === "pendentes" && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.missing.map((m) => (
                          <span
                            key={m}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                              m === "Tomador de Decisão"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {m === "Tomador de Decisão" ? "Sem tomador de decisão" : `falta ${m}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {filter === "completos" && <span className="text-emerald-400 text-sm shrink-0">✓</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
