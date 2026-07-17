type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
  /** Quando passado, o card vira clicável (abre um detalhamento). */
  onClick?: () => void;
};

export default function KpiCard({ label, value, hint, accent = "ink", loading = false, onClick }: Props) {
  const accentColor =
    accent === "orange" ? "text-psa-orange" : accent === "blue" ? "text-psa-blue" : "text-psa-ink";
  const dotColor =
    accent === "orange" ? "bg-psa-orange" : accent === "blue" ? "bg-psa-blue" : "bg-psa-ink";

  const clickable = !!onClick && !loading;

  return (
    <div
      className={`rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card min-w-0 transition-all ${
        clickable ? "cursor-pointer hover:border-psa-orange/40 hover:bg-psa-canvas/40" : ""
      }`}
      style={{ containerType: "inline-size" }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
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
        <div className="mt-2 text-xs text-psa-ink-soft">
          {loading ? <span className="skeleton h-3 w-32 inline-block" /> : hint}
        </div>
      )}
    </div>
  );
}
