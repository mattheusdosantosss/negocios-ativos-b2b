"use client";

import { useEffect, useState } from "react";
import type { ConversionData } from "@/lib/aggregate";
import type { MotivosData, MotivosItem } from "@/lib/hubspot";
import TemperatureStacked from "@/components/TemperatureStacked";

const PROPOSTA_CATS = [
  { id: "com", label: "Com proposta anexada" },
  { id: "sem", label: "Sem proposta anexada" },
];
const PROPOSTA_STYLE = {
  com: { fill: "#1E9E62", text: "#fff" },
  sem: { fill: "#E8A317", text: "#3A2A00" },
};

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const pctND = (n: number, d: number) => (d > 0 ? pct(n / d) : "0%");
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: ConversionData; motivos?: MotivosData; forcedMonth?: string | null; showProposta?: boolean };

/**
 * Taxa de conversão (ganho × perdido) + motivos de perda no mesmo card. Segue o
 * filtro de tempo do topo: quando `forcedMonth` (YYYY-MM) vem setado, trava o
 * card nesse mês e esconde o seletor; senão, seletor de mês próprio.
 */
export default function ConversionCard({ data, motivos, forcedMonth, showProposta }: Props) {
  const [monthState, setMonth] = useState<string>("all");
  const [open, setOpen] = useState<{ name: string; deals: MotivosItem[] } | null>(null);

  // forcedMonth (do filtro de tempo) manda; se não, usa o seletor interno.
  const forced = forcedMonth != null;
  const month = forced ? forcedMonth : monthState;

  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const scopeLabel = month === "all" ? "todo o histórico" : data.months.find((m) => m.key === month)?.label ?? month;
  const mScope = !motivos ? null : month === "all" ? motivos.geral : motivos.months.find((m) => m.key === month) ?? motivos.geral;
  const mMax = mScope?.reasons[0]?.count ?? 1;

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Taxa de conversão</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(scope.conv)}</span>
            <span className="text-sm text-psa-ink-soft">
              <b className="text-psa-ink">{num(scope.won)}</b> ganhos ·{" "}
              <b className="text-psa-ink">{num(Math.max(0, scope.entered - scope.won))}</b> perdidos ·{" "}
              <span className="text-psa-muted">{scopeLabel}</span>
            </span>
          </div>
          {data.denomLabel && <div className="mt-1 text-[11px] text-psa-muted">{data.denomLabel}</div>}
        </div>

        <div className="flex flex-col shrink-0">
          <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">
            {data.monthFilterLabel}
          </label>
          {forced ? (
            // Travado pelo filtro de tempo do topo — mostra o mês, sem seletor.
            <div className="rounded-lg border border-psa-line bg-psa-canvas px-3 py-2 text-sm text-psa-ink min-w-[190px]">
              {scopeLabel} <span className="text-psa-muted text-xs">· pelo filtro de tempo</span>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {mScope && mScope.total > 0 && (
        <div className="mt-5 pt-4 border-t border-psa-line">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft mb-3">
            Motivos de perda · {num(mScope.total)} <span className="text-psa-muted font-normal normal-case tracking-normal">· clique pra listar</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {mScope.reasons.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => setOpen({ name: r.name, deals: r.deals })}
                title={`${r.name}: ${num(r.count)}`}
                className="group flex items-center gap-3 text-left"
              >
                <span className="text-[12px] text-psa-ink-soft truncate w-[40%] group-hover:text-psa-ink">{r.name}</span>
                <span className="flex-1 h-2 rounded bg-psa-canvas overflow-hidden">
                  <span className="block h-full bg-psa-orange rounded" style={{ width: `${(r.count / mMax) * 100}%` }} />
                </span>
                <span className="text-[11px] text-psa-ink-soft tabular-nums w-[86px] text-right">
                  <b className="text-psa-ink">{num(r.count)}</b> · {pctND(r.count, mScope.total)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Proposta anexada nos perdidos — mesmo padrão do gráfico de temperatura.
          Só no B2B (onde proposta anexada é o balizador). */}
      {showProposta && mScope && mScope.proposta.com + mScope.proposta.sem > 0 && (
        <div className="mt-5 pt-4 border-t border-psa-line">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft mb-3">
            Proposta anexada nos perdidos
          </div>
          <TemperatureStacked
            stages={[{ id: "perdidos", label: "" }]}
            categories={PROPOSTA_CATS}
            styleMap={PROPOSTA_STYLE}
            matrix={{ perdidos: { com: mScope.proposta.com, sem: mScope.proposta.sem } }}
            showConviccao={false}
            unitLabel="perdidos"
          />
        </div>
      )}

      {open && <MotivosModal title={open.name} deals={open.deals} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MotivosModal({ title, deals, onClose }: { title: string; deals: MotivosItem[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold">{title}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {num(deals.length)} {deals.length === 1 ? "negócio perdido" : "negócios perdidos"}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ol className="divide-y divide-white/10">
            {deals.map((d, i) => (
              <li key={i} className="hover:bg-white/[0.03] transition-colors">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="group px-6 py-3 flex items-center gap-4" title="Abrir negócio no HubSpot">
                  <span className="text-xs font-mono text-white/40 tabular-nums w-8">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 min-w-0 text-sm text-white/90 truncate group-hover:text-psa-orange group-hover:underline">{d.dealname}</span>
                  <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
