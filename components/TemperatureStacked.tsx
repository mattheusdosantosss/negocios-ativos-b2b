"use client";

import { type ReactNode } from "react";
import { TEMPERATURES, conviccaoEtapa } from "@/lib/aggregate";

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

// Cores do Perfil (mesma paleta PSA). "Sem perfil" cinza claro, como o vazio da
// temperatura.
export const PERFIL_STYLE: Record<string, { fill: string; text: string }> = {
  escala: { fill: "#7A3FF2", text: "#fff" },
  profissionalize: { fill: "#0E8C8B", text: "#fff" },
  iniciante: { fill: "#E8A317", text: "#3A2A00" },
  sem_perfil: { fill: "#E8E5E1", text: "#806D61" },
};

// Cores da situação de tarefa: atrasada = vermelho (crítico), sem tarefa =
// âmbar (lacuna), ≤24h = verde (ação iminente), +24h = azul (planejada).
export const TASK_STYLE: Record<string, { fill: string; text: string }> = {
  atrasada: { fill: "#C0432F", text: "#fff" },
  sem_tarefa: { fill: "#E8A317", text: "#3A2A00" },
  prox24: { fill: "#1E9E62", text: "#fff" },
  mais24: { fill: "#053CAA", text: "#fff" },
};

type Stage = { id: string; label: string };
type Category = { id: string; label: string };

type Props = {
  stages: Stage[];
  matrix: Record<string, Record<string, number>>;
  /** Clique num segmento (etapa + categoria). */
  onOpen?: (stageId: string, categoryId: string) => void;
  /** Menor (usado no dropdown do closer). */
  compact?: boolean;
  /** Palavra ao lado do total de cada barra (default "ativos"). */
  unitLabel?: string;
  /** Mostra convicção · sem leitura no fim de cada linha (default true). */
  showConviccao?: boolean;
  /** Categorias empilhadas (default: temperatura). Ex.: perfil. */
  categories?: Category[];
  /** Cores por categoria (default: TEMP_STYLE). */
  styleMap?: Record<string, { fill: string; text: string }>;
  /** Estatística custom à direita de cada linha (substitui o bloco de convicção). */
  rightStat?: (stageId: string) => ReactNode;
};

export default function TemperatureStacked({
  stages,
  matrix,
  onOpen,
  compact = false,
  unitLabel = "ativos",
  showConviccao = true,
  categories = TEMPERATURES,
  styleMap = TEMP_STYLE,
  rightStat,
}: Props) {
  const barH = compact ? 22 : 26;
  const stageTotal = (sid: string) =>
    categories.reduce((sum, c) => sum + (matrix[sid]?.[c.id] ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
        {categories.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span
              className="inline-block w-2.5 h-2.5 rounded-[3px]"
              style={{ background: styleMap[t.id].fill }}
            />
            {t.label}
          </span>
        ))}
      </div>

      <div className={compact ? "space-y-3" : "space-y-4"}>
        {stages.map((s) => {
          const total = stageTotal(s.id);
          const semLeitura = matrix[s.id]?.sem_leitura ?? 0;
          return (
            <div key={s.id}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className={`font-medium ${compact ? "text-xs" : "text-[13px]"}`}>
                  {s.label} <span className="text-psa-ink-soft font-normal">{num(total)} {unitLabel}</span>
                </span>
                {rightStat ? (
                  <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">{rightStat(s.id)}</span>
                ) : (
                  showConviccao && (
                    <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">
                      convicção <b className="text-psa-ink">{pct(conviccaoEtapa(matrix, s.id))}</b> · {num(semLeitura)} sem leitura
                    </span>
                  )
                )}
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ height: barH }}>
                {total === 0 ? (
                  <div className="w-full bg-psa-canvas" />
                ) : (
                  categories.map((t) => {
                    const count = matrix[s.id]?.[t.id] ?? 0;
                    if (count === 0) return null;
                    const w = (count / total) * 100;
                    const style = styleMap[t.id];
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
