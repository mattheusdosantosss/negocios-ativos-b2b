"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  /** Título do card (também é a chave de persistência do estado recolhido). */
  title: string;
  /** Texto/estatística à direita do título. */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Começa aberto? (default true). */
  defaultOpen?: boolean;
};

/**
 * Card padrão do painel (mesmo chrome dos demais) com título clicável pra
 * recolher/expandir. O estado de cada card é guardado no localStorage pela
 * chave do título, então some/reaparece do jeito que o usuário deixou.
 */
export default function SectionCard({ title, subtitle, children, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`card:${title}`);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* localStorage indisponível — mantém o default */
    }
  }, [title]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(`card:${title}`, next ? "1" : "0");
      } catch {
        /* ignora */
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={open ? "Recolher" : "Expandir"}
          className="group flex items-center gap-2 min-w-0 text-left"
        >
          <span
            className={`text-psa-ink-soft text-[11px] leading-none transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <h2 className="font-display text-sm font-semibold text-psa-ink group-hover:text-psa-orange transition-colors">
            {title}
          </h2>
        </button>
        {subtitle && <span className="text-[11px] text-psa-ink-soft">{subtitle}</span>}
      </div>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
