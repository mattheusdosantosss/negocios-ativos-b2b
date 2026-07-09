type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "orange" | "blue" | "ink";
  loading?: boolean;
};

export default function KpiCard({ label, value, hint, accent = "ink", loading = false }: Props) {
  const accentColor =
    accent === "orange" ? "text-psa-orange" : accent === "blue" ? "text-psa-blue" : "text-psa-ink";
  const dotColor =
    accent === "orange" ? "bg-psa-orange" : accent === "blue" ? "bg-psa-blue" : "bg-psa-ink";

  return (
    <div
      className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card min-w-0"
      style={{ containerType: "inline-size" }}
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
