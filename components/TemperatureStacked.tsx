"use client";

import { TEMPERATURES, conviccaoEtapa, tempStageTotal } from "@/lib/aggregate";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// Cor de cada temperatura. "Larguei de mão" é hachurado (descarte), "Sem
// leitura" é cinza claro. Segue a identidade do painel (laranja/azul PSA).
const TEMP_STYLE: Record<string, { fill: string; text: string }> = {
  vou_vender: { fill: "#FF640F", text: "#fff" },
  forecast: { fill: "#053CAA", text: "#fff" },
  cafe: { fill: "#D9C2A3", text: "#4A3B27" },
  larguei: { fill: "repeating-linear-gradient(135deg,#4A4A4A 0 5px,#6a6a6a 5px 10px)", text: "#fff" },
  sem_leitura: { fill: "#E8E5E1", text: "#806D61" },
};

type Stage = { id: string; label: string };

type Props = {
  stages: Stage[];
  matrix: Record<string, Record<string, number>>;
  /** Clique num segmento (etapa + temperatura). */
  onOpen?: (stageId: string, tempId: string) => void;
  /** Menor (usado no dropdown do closer). */
  compact?: boolean;
};

export default function TemperatureStacked({ stages, matrix, onOpen, compact = false }: Props) {
  const barH = compact ? 22 : 26;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
        {TEMPERATURES.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span
              className="inline-block w-2.5 h-2.5 rounded-[3px]"
              style={{ background: TEMP_STYLE[t.id].fill }}
            />
            {t.label}
          </span>
        ))}
      </div>

      <div className={compact ? "space-y-3" : "space-y-4"}>
        {stages.map((s) => {
          const total = tempStageTotal(matrix, s.id);
          const semLeitura = matrix[s.id]?.sem_leitura ?? 0;
          return (
            <div key={s.id}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className={`font-medium ${compact ? "text-xs" : "text-[13px]"}`}>
                  {s.label} <span className="text-psa-ink-soft font-normal">{num(total)} ativos</span>
                </span>
                <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">
                  convicção <b className="text-psa-ink">{pct(conviccaoEtapa(matrix, s.id))}</b> · {num(semLeitura)} sem leitura
                </span>
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ height: barH }}>
                {total === 0 ? (
                  <div className="w-full bg-psa-canvas" />
                ) : (
                  TEMPERATURES.map((t) => {
                    const count = matrix[s.id]?.[t.id] ?? 0;
                    if (count === 0) return null;
                    const w = (count / total) * 100;
                    const style = TEMP_STYLE[t.id];
                    const showNum = w >= 7;
                    const clickable = !!onOpen;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={!clickable}
                        onClick={() => onOpen?.(s.id, t.id)}
                        title={`${s.label} · ${t.label}: ${num(count)}`}
                        className="flex items-center justify-center text-[11px] font-medium transition-opacity hover:opacity-85"
                        style={{ width: `${w}%`, background: style.fill, color: style.text }}
                      >
                        {showNum ? num(count) : ""}
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
