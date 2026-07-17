type Stage = { id: string; label: string };

type Props = {
  stages: Stage[];
  porEtapa: Record<string, number>;
  loading?: boolean;
  onOpenStage?: (stageId: string) => void;
};

const num = (n: number) => n.toLocaleString("pt-BR");

export default function StageFunnel({ stages, porEtapa, loading = false, onOpenStage }: Props) {
  const max = Math.max(1, ...stages.map((s) => porEtapa[s.id] || 0));

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <h2 className="font-display text-sm font-semibold text-psa-ink mb-4">Negócios ativos por etapa</h2>
      <div className="space-y-3">
        {stages.map((s) => {
          const count = porEtapa[s.id] || 0;
          const pct = Math.round((count / max) * 100);
          const clickable = !loading && count > 0 && !!onOpenStage;

          const rowInner = (
            <>
              <div className="w-52 shrink-0 text-xs font-medium text-psa-ink-soft truncate" title={s.label}>
                {s.label}
              </div>
              <div className="flex-1 h-3 rounded-full bg-psa-canvas overflow-hidden">
                {loading ? (
                  <div className="skeleton h-full w-full" />
                ) : (
                  <div
                    className="h-full rounded-full bg-psa-orange transition-all"
                    style={{ width: `${count > 0 ? Math.max(pct, 4) : 0}%` }}
                  />
                )}
              </div>
              <div
                className={`w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-psa-ink ${
                  clickable ? "group-hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60" : ""
                }`}
              >
                {loading ? "" : num(count)}
              </div>
            </>
          );

          return clickable ? (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenStage!(s.id)}
              className="group w-full flex items-center gap-3 rounded-lg -mx-2 px-2 py-1 hover:bg-psa-canvas/60 transition-colors text-left"
              title={`Ver todos os negócios em "${s.label}"`}
            >
              {rowInner}
            </button>
          ) : (
            <div key={s.id} className="flex items-center gap-3 -mx-2 px-2 py-1">
              {rowInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
