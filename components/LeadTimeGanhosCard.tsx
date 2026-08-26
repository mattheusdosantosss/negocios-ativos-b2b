"use client";

import { useState } from "react";
import type { LeadTimeGanhosData, LeadTimeFaixa } from "@/lib/b2cCards";
import DealListModal from "./DealListModal";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

export default function LeadTimeGanhosCard({ data }: { data: LeadTimeGanhosData }) {
  const [sel, setSel] = useState<LeadTimeFaixa | null>(null);
  const max = Math.max(1, ...data.faixas.map((f) => f.count));
  const cobertura = data.total > 0 ? data.comData / data.total : 0;

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Lead time dos ganhos</div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(data.medianaDias)}d</span>
          <span className="text-sm text-psa-ink-soft">
            tempo típico · <b className="text-psa-ink">{num(data.comData)}</b> {data.comData === 1 ? "ganho" : "ganhos"} com data
          </span>
        </div>
        <div className="mt-1 text-[11px] text-psa-muted">
          Da qualificação até o ganho · metade em até {num(data.medianaDias)} dia{data.medianaDias === 1 ? "" : "s"} · cobertura {pct(cobertura)} · clique pra listar
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-psa-line flex flex-col gap-2">
        {data.faixas.map((f) => {
          const barW = (f.count / max) * 100;
          const p = data.comData > 0 ? (f.count / data.comData) * 100 : 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={f.count > 0 ? () => setSel(f) : undefined}
              disabled={f.count === 0}
              className="group flex items-center gap-3 text-left enabled:cursor-pointer"
              title={`${f.label}: ${num(f.count)}`}
            >
              <span className="text-[12px] text-psa-ink-soft truncate w-[92px] group-enabled:group-hover:text-psa-ink">{f.label}</span>
              <span className="flex-1 h-3 rounded bg-psa-canvas overflow-hidden">
                <span className="block h-full bg-psa-orange rounded transition-all" style={{ width: `${barW}%` }} />
              </span>
              <span className="text-[11px] text-psa-ink-soft tabular-nums w-[104px] text-right">
                <b className="text-psa-ink">{num(f.count)}</b> · {p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </span>
            </button>
          );
        })}
      </div>

      <DealListModal
        open={sel !== null}
        onClose={() => setSel(null)}
        stageLabel={`Lead time · ${sel?.label ?? ""}`}
        deals={sel?.deals ?? []}
        dateField="closedate"
      />
    </div>
  );
}
