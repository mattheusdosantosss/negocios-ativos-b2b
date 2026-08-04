"use client";

import type { MacroTemaData } from "@/lib/aggregate";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const WON = "#1E9E62";
const LOST = "#C0432F";

type Props = {
  data: MacroTemaData;
};

/**
 * Conversão por macro tema: colunas de largura fixa que rolam na horizontal.
 * Barra 100% empilhada (todas mesma altura) — verde = taxa de conversão (base),
 * vermelho = perda (topo). Assim a altura do verde lê direto como conversão e,
 * ordenado por conversão, vira uma escada decrescente. % no topo, volume abaixo.
 */
export default function MacroTemaConversion({ data }: Props) {
  const rows = [...data.rows].sort((a, b) => b.conv - a.conv);
  const BAR_H = 150; // px da área de plotagem

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: WON }} /> Ganho
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
          <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: LOST }} /> Perdido
        </span>
        <span className="text-[10px] text-psa-muted">altura do verde = % de conversão · role para o lado →</span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 w-max">
          {rows.map((r) => {
            const wonH = r.total > 0 ? (r.won / r.total) * 100 : 0;
            const lostH = r.total > 0 ? (r.lost / r.total) * 100 : 0;
            return (
              <div
                key={r.id}
                className="group w-[68px] shrink-0 flex flex-col items-center"
                title={`${r.label} · conversão ${pct1(r.conv * 100)}% · Ganho ${num(r.won)} · Perdido ${num(r.lost)} · total ${num(r.total)}`}
              >
                {/* barra empilhada Ganho/Perdido */}
                <div className="w-full flex items-end justify-center border-b border-psa-line" style={{ height: BAR_H }}>
                  <div className="flex flex-col items-center justify-end h-full">
                    <span className="text-[10px] font-bold text-psa-ink tabular-nums mb-1 leading-none">
                      {pct1(r.conv * 100)}%
                    </span>
                    <div
                      className="w-9 rounded-t-[4px] overflow-hidden flex flex-col transition-opacity group-hover:opacity-90"
                      style={{ height: BAR_H }}
                    >
                      {/* Perdido (topo) — nº dentro se couber */}
                      <div className="flex items-center justify-center" style={{ height: `${lostH}%`, background: LOST }}>
                        {lostH >= 9 && <span className="text-[9px] font-bold text-white tabular-nums leading-none">{num(r.lost)}</span>}
                      </div>
                      {/* Ganho (base) — nº dentro se couber */}
                      <div className="flex items-center justify-center" style={{ height: `${wonH}%`, background: WON }}>
                        {wonH >= 9 && <span className="text-[9px] font-bold text-white tabular-nums leading-none">{num(r.won)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* rótulo horizontal, 2 linhas (quebra palavra longa) */}
                <div className="mt-2 h-8 px-0.5 text-center">
                  <span className="block text-[10.5px] leading-tight text-psa-ink line-clamp-2 break-words">{r.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
