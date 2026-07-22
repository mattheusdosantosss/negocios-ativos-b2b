"use client";

import type { CloseTimeData } from "@/lib/aggregate";

const num = (n: number) => n.toLocaleString("pt-BR");

// Ganho = verde (positivo), Perdido = vermelho/terracota. Semântica win/loss.
const OUTCOME_STYLE: Record<string, { fill: string; text: string }> = {
  won: { fill: "#1E9E62", text: "#fff" },
  lost: { fill: "#C0432F", text: "#fff" },
};

type Props = {
  data: CloseTimeData;
  /** Clique num segmento (faixa + resultado). */
  onOpen?: (bucketId: string, outcomeId: string) => void;
};

export default function CloseTimeChart({ data, onOpen }: Props) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
        {data.outcomes.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span
              className="inline-block w-2.5 h-2.5 rounded-[3px]"
              style={{ background: OUTCOME_STYLE[o.id]?.fill }}
            />
            {o.label}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {data.buckets.map((b) => {
          const row = data.matrix[b.id] ?? {};
          const won = row.won ?? 0;
          const lost = row.lost ?? 0;
          const total = won + lost;
          return (
            <div key={b.id}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className="font-medium text-[13px]">
                  {b.label} <span className="text-psa-ink-soft font-normal">{num(total)} negócios</span>
                </span>
                <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">
                  <b className="text-psa-ink">{num(won)}</b> ganho · <b className="text-psa-ink">{num(lost)}</b> perdido
                </span>
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
                {total === 0 ? (
                  <div className="w-full bg-psa-canvas" />
                ) : (
                  data.outcomes.map((o) => {
                    const count = row[o.id] ?? 0;
                    if (count === 0) return null;
                    const w = (count / total) * 100;
                    const st = OUTCOME_STYLE[o.id];
                    const clickable = !!onOpen;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!clickable}
                        onClick={() => onOpen?.(b.id, o.id)}
                        title={`${b.label} · ${o.label}: ${num(count)}`}
                        className="flex items-center justify-center text-[11px] font-medium transition-opacity hover:opacity-85"
                        style={{ width: `${w}%`, background: st?.fill, color: st?.text }}
                      >
                        {w >= 8 ? num(count) : ""}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
