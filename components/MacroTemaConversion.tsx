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

      {/* Colunas verticais: altura ∝ volume (total), empilhando Ganho (base) e
          Perdido (topo). Conversão em cima, rótulo + total embaixo. Rola na
          horizontal quando há muitos temas. */}
      <div className="overflow-x-auto">
        <div className="flex items-end gap-3 min-h-[200px]" style={{ height: 200 }}>
          {data.rows.map((r) => {
            const maxTotal = Math.max(1, ...data.rows.map((x) => x.total));
            const colH = (r.total / maxTotal) * 150; // px; reserva ~50px pros textos
            const wonH = r.total > 0 ? (r.won / r.total) * 100 : 0;
            const lostH = r.total > 0 ? (r.lost / r.total) * 100 : 0;
            return (
              <div key={r.id} className="flex flex-col items-center justify-end shrink-0 w-[72px] h-full">
                <span className="text-[11px] font-bold text-psa-ink tabular-nums mb-1">{pct(r.conv)}</span>
                <div
                  className="w-full rounded-md overflow-hidden flex flex-col bg-psa-canvas"
                  style={{ height: Math.max(4, colH) }}
                  title={`${r.label} · ${num(r.total)} negócios · Ganho ${num(r.won)} · Perdido ${num(r.lost)}`}
                >
                  {r.lost > 0 && <div style={{ height: `${lostH}%`, background: LOST.fill }} />}
                  {r.won > 0 && <div style={{ height: `${wonH}%`, background: WON.fill }} />}
                </div>
                <span className="mt-1.5 text-[11px] font-medium text-center leading-tight line-clamp-2" title={r.label}>
                  {r.label}
                </span>
                <span className="text-[10px] text-psa-ink-soft tabular-nums">{num(r.total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
