"use client";

import type { MacroTemaData } from "@/lib/aggregate";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// Mesma semântica win/loss do card "Tempo da reunião ao fechamento".
const WON = { fill: "#1E9E62", text: "#fff" };
const LOST = { fill: "#C0432F", text: "#fff" };

type Props = {
  data: MacroTemaData;
};

export default function MacroTemaConversion({ data }: Props) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: WON.fill }} />
          Ganho
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: LOST.fill }} />
          Perdido
        </span>
      </div>

      <div className="space-y-4">
        {data.rows.map((r) => {
          const wonW = r.total > 0 ? (r.won / r.total) * 100 : 0;
          const lostW = r.total > 0 ? (r.lost / r.total) * 100 : 0;
          return (
            <div key={r.id}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className="font-medium text-[13px]">
                  {r.label} <span className="text-psa-ink-soft font-normal">{num(r.total)} negócios</span>
                </span>
                <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">
                  conversão <b className="text-psa-ink">{pct(r.conv)}</b> · Ganho {num(r.won)} · Perdido {num(r.lost)}
                </span>
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
                {r.total === 0 ? (
                  <div className="w-full bg-psa-canvas" />
                ) : (
                  <>
                    {r.won > 0 && (
                      <div
                        className="flex items-center justify-center text-[11px] font-medium text-white"
                        style={{ width: `${wonW}%`, background: WON.fill }}
                        title={`${r.label} · Ganho: ${num(r.won)}`}
                      >
                        {wonW >= 8 ? num(r.won) : ""}
                      </div>
                    )}
                    {r.lost > 0 && (
                      <div
                        className="flex items-center justify-center text-[11px] font-medium text-white"
                        style={{ width: `${lostW}%`, background: LOST.fill }}
                        title={`${r.label} · Perdido: ${num(r.lost)}`}
                      >
                        {lostW >= 8 ? num(r.lost) : ""}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
