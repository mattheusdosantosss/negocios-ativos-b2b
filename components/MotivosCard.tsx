"use client";

import { useEffect, useState } from "react";
import type { MotivosData, MotivosItem } from "@/lib/hubspot";

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
  const [open, setOpen] = useState<{ name: string; deals: MotivosItem[] } | null>(null);
  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const max = scope.reasons[0]?.count ?? 1;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <span className="text-[11px] text-psa-ink-soft tabular-nums">
          <b className="text-psa-ink">{num(scope.total)}</b> negócios perdidos · clique pra listar
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
              <button
                type="button"
                onClick={() => setOpen({ name: r.name, deals: r.deals })}
                title={`${r.name}: ${num(r.count)} · clique pra listar`}
                className="flex w-full rounded-md overflow-hidden transition-opacity hover:opacity-85"
                style={{ height: 26, background: "var(--psa-canvas, #FAF8F5)" }}
              >
                <span
                  className="flex items-center justify-center text-[11px] font-medium text-white tabular-nums"
                  style={{ width: `${(r.count / max) * 100}%`, background: "#FF640F", minWidth: 2 }}
                >
                  {w >= 7 ? num(r.count) : ""}
                </span>
              </button>
            </div>
          );
        })}
      </div>

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
                  <span className="flex-1 min-w-0 text-sm text-white/90 truncate group-hover:text-psa-orange group-hover:underline">
                    {d.dealname}
                  </span>
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
