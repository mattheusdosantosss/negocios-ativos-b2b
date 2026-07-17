type Bucket = { id: string; label: string };

type Props = {
  buckets: Bucket[];
  porFaixa: Record<string, number>;
  onOpenBucket?: (bucketId: string) => void;
  /** Bucket destacado sem cor (negrito + badge + barra hachurada). */
  criticalBucketId?: string;
  /** Texto do title do badge crítico. */
  criticalHint?: string;
  /** Texto exibido dentro do badge crítico. */
  criticalLabel?: string;
};

const num = (n: number) => n.toLocaleString("pt-BR");

export default function AgingFunnel({
  buckets,
  porFaixa,
  onOpenBucket,
  criticalBucketId,
  criticalHint,
  criticalLabel = "acima do ciclo",
}: Props) {
  const max = Math.max(1, ...buckets.map((b) => porFaixa[b.id] || 0));

  return (
    <div className="space-y-3">
      {buckets.map((b) => {
        const count = porFaixa[b.id] || 0;
        const pct = Math.round((count / max) * 100);
        const critical = !!criticalBucketId && b.id === criticalBucketId;
        const clickable = count > 0 && !!onOpenBucket;

        const rowInner = (
          <>
            <div
              className={`w-24 shrink-0 text-xs text-psa-ink-soft flex items-center gap-1 ${
                critical ? "font-bold text-psa-ink" : "font-medium"
              }`}
            >
              {b.label}
              {critical && (
                <span
                  className="inline-flex items-center rounded-full border border-psa-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-psa-ink"
                  title={criticalHint}
                >
                  {criticalLabel}
                </span>
              )}
            </div>
            <div className="flex-1 h-3 rounded-full bg-psa-canvas overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  critical
                    ? "bg-[repeating-linear-gradient(135deg,theme(colors.psa.ink)_0,theme(colors.psa.ink)_6px,theme(colors.psa.ink/70)_6px,theme(colors.psa.ink/70)_12px)]"
                    : "bg-psa-orange"
                }`}
                style={{ width: `${count > 0 ? Math.max(pct, 4) : 0}%` }}
              />
            </div>
            <div
              className={`w-10 shrink-0 text-right text-sm tabular-nums ${
                critical ? "font-bold text-psa-ink" : "font-semibold text-psa-ink"
              } ${clickable ? "group-hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60" : ""}`}
            >
              {num(count)}
            </div>
          </>
        );

        return clickable ? (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpenBucket!(b.id)}
            className="group w-full flex items-center gap-3 rounded-lg -mx-2 px-2 py-1 hover:bg-psa-canvas/60 transition-colors text-left"
            title={`Ver negócios na faixa "${b.label}"`}
          >
            {rowInner}
          </button>
        ) : (
          <div key={b.id} className="flex items-center gap-3 -mx-2 px-2 py-1">
            {rowInner}
          </div>
        );
      })}
    </div>
  );
}
