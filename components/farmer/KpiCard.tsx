"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
  /** Quando passado, o card vira clicável (abre o drill-down). */
  onClick?: () => void;
  /** Linhas de regra exibidas no popover "Regras deste indicador". */
  info?: string[];
};

const POPOVER_W = 256; // w-64

export default function KpiCard({
  label,
  value,
  hint,
  accent = "ink",
  loading = false,
  onClick,
  info,
}: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Posiciona o popover (fixed) a partir do botão ⓘ — fora de qualquer
  // stacking context dos cards, então nunca é sobreposto pelos vizinhos.
  useLayoutEffect(() => {
    if (!showInfo || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.max(8, r.right - POPOVER_W);
    setPos({ top: r.bottom + 6, left });
  }, [showInfo]);

  // Fecha ao clicar fora, rolar ou redimensionar
  useEffect(() => {
    if (!showInfo) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setShowInfo(false);
    };
    const onScrollResize = () => setShowInfo(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [showInfo]);

  const accentColor =
    accent === "orange" ? "text-psa-orange" : accent === "blue" ? "text-psa-blue" : "text-psa-ink";
  const dotColor =
    accent === "orange" ? "bg-psa-orange" : accent === "blue" ? "bg-psa-blue" : "bg-psa-ink";

  const interactive = !!onClick && !loading;

  return (
    <div
      className={`relative group rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card hover:shadow-card-hover transition-all min-w-0 ${
        interactive ? "cursor-pointer hover:border-psa-orange/40 hover:bg-psa-canvas/40" : ""
      }`}
      style={{ containerType: "inline-size" }}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={interactive ? `Ver detalhes de ${label}` : undefined}
    >
      {info && info.length > 0 && (
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo((v) => !v);
          }}
          className={`absolute top-3 right-3 w-5 h-5 inline-flex items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
            showInfo
              ? "border-psa-blue text-psa-blue"
              : "border-psa-line text-psa-ink-soft hover:border-psa-blue hover:text-psa-blue"
          }`}
          title="Ver regras deste indicador"
          aria-label={`Regras de ${label}`}
        >
          i
        </button>
      )}

      {showInfo && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[100] w-64 rounded-xl border border-psa-line bg-psa-surface shadow-card-hover p-3 text-left"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft mb-2">
              Regras de “{label}”
            </div>
            <ul className="space-y-1.5">
              {info?.map((line, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-psa-ink leading-snug">
                  <span className="text-psa-orange mt-0.5 leading-none">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}

      <div className="flex items-center gap-2 pr-7">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-psa-ink-soft">
          {label}
        </span>
      </div>

      <div className="mt-3 min-h-[42px] flex items-baseline min-w-0 overflow-hidden">
        {loading ? (
          <span className="skeleton h-9 w-24 inline-block" />
        ) : (
          <span
            className={`font-display font-bold leading-none tabular-nums whitespace-nowrap ${accentColor} text-[clamp(1.5rem,5cqw,2.125rem)]`}
          >
            {value}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-2 text-xs text-psa-ink-soft flex items-center gap-1">
          {loading ? (
            <span className="skeleton h-3 w-32 inline-block" />
          ) : (
            <>
              {hint}
              {interactive && (
                <span className="text-psa-orange opacity-0 group-hover:opacity-100 transition-opacity">
                  · ver lista ↗
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
