"use client";

import { useState } from "react";
import type { ConversionData } from "@/lib/aggregate";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: ConversionData };

export default function ConversionCard({ data }: Props) {
  const [month, setMonth] = useState<string>("all");
  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const scopeLabel = month === "all" ? "todo o histórico" : data.months.find((m) => m.key === month)?.label ?? "";

  // Mini-gráfico: 12 meses mais recentes, em ordem cronológica.
  const chart = [...data.months].slice(0, 12).reverse();
  const maxConv = Math.max(0.0001, ...chart.map((m) => m.conv));

  return (
    <div>
      <div className="mb-5">
        <label className="block mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">
          Mês de criação dos negócios
        </label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-psa-line bg-psa-canvas px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[190px]"
        >
          <option value="all">Geral (todo o histórico)</option>
          {data.months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="font-display text-[44px] leading-none font-extrabold text-psa-orange tabular-nums">
          {pct(scope.conv)}
        </span>
        <span className="text-sm text-psa-ink-soft">
          <b className="text-psa-ink">{num(scope.won)}</b> ganhos de <b className="text-psa-ink">{num(scope.entered)}</b>{" "}
          que entraram em Proposta enviada · <span className="text-psa-muted">{scopeLabel}</span>
        </span>
      </div>

      {chart.length > 1 && (
        <div className="mt-6">
          <div className="flex items-end gap-1.5" style={{ height: 96 }}>
            {chart.map((m) => {
              const h = Math.max(3, (m.conv / maxConv) * 100);
              const active = m.key === month;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMonth(active ? "all" : m.key)}
                  title={`${m.label}: ${pct(m.conv)} (${num(m.won)}/${num(m.entered)})`}
                  className="group flex-1 flex flex-col items-center justify-end gap-1 h-full"
                >
                  <span className="text-[9px] text-psa-ink-soft tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    {pct(m.conv)}
                  </span>
                  <div
                    className={`w-full rounded-t transition-colors ${
                      active ? "bg-psa-orange" : "bg-psa-orange/35 group-hover:bg-psa-orange/60"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                  <span className={`text-[9px] tabular-nums ${active ? "text-psa-ink font-semibold" : "text-psa-ink-soft"}`}>
                    {m.label.slice(0, 3)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-psa-muted">
            Conversão por mês de criação. Meses recentes tendem a mostrar taxa menor — os negócios ainda estão em aberto/maturando.
          </p>
        </div>
      )}
    </div>
  );
}
