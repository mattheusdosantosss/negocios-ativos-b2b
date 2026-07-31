"use client";

import { useState } from "react";
import type { MotivosData } from "@/lib/hubspot";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%");

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MES[Number(m) - 1] ?? m}/${y}`;
};

type Props = { data: MotivosData };

export default function MotivosCard({ data }: Props) {
  const [month, setMonth] = useState<string>("all");
  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const max = scope.reasons[0]?.count ?? 1;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <span className="text-[11px] text-psa-ink-soft tabular-nums">
          <b className="text-psa-ink">{num(scope.total)}</b> negócios perdidos · % sobre os perdidos
        </span>
        <div className="flex flex-col">
          <label className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">Mês de fechamento</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-[170px] rounded-lg border border-psa-line bg-psa-canvas px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10"
          >
            <option value="all">Geral (últimos 6 meses)</option>
            {data.months.map((m) => (
              <option key={m.key} value={m.key}>
                {mesLabel(m.key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {scope.reasons.map((r) => {
          const w = (r.count / scope.total) * 100;
          return (
            <div key={r.name}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <span className="font-medium text-[13px]">{r.name}</span>
                <span className="text-[11px] text-psa-ink-soft whitespace-nowrap tabular-nums">
                  <b className="text-psa-ink">{num(r.count)}</b> · {pct(r.count, scope.total)}
                </span>
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
                <div
                  className="flex items-center justify-center text-[11px] font-medium text-white tabular-nums"
                  style={{ width: `${(r.count / max) * 100}%`, background: "#FF640F", minWidth: 2 }}
                  title={`${r.name}: ${num(r.count)}`}
                >
                  {w >= 7 ? num(r.count) : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
