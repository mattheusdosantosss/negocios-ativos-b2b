"use client";

import { useState } from "react";
import type { ConversionData } from "@/lib/aggregate";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: ConversionData };

/**
 * Headline da taxa de conversão Proposta → Ganho. Número em destaque + seletor
 * de mês de criação (client-side). Mesmo chrome de card do painel.
 */
export default function ConversionCard({ data }: Props) {
  const [month, setMonth] = useState<string>("all");
  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const scopeLabel = month === "all" ? "todo o histórico" : data.months.find((m) => m.key === month)?.label ?? "";

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card flex items-center justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
          Taxa de conversão · Ganho ÷ criados
        </div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(scope.conv)}</span>
          <span className="text-sm text-psa-ink-soft">
            <b className="text-psa-ink">{num(scope.won)}</b> ganhos de{" "}
            <b className="text-psa-ink">{num(scope.entered)}</b> negócios criados ·{" "}
            <span className="text-psa-muted">{scopeLabel}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col shrink-0">
        <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">
          Mês de criação
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
    </div>
  );
}
