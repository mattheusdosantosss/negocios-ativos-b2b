"use client";

import type { ConvCloserData } from "@/lib/b2cCards";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function ConvCloserCard({ data }: { data: ConvCloserData }) {
  const max = Math.max(0.001, ...data.rows.map((r) => r.taxa));

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Conversão por closer</div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(data.total.taxa)}</span>
          <span className="text-sm text-psa-ink-soft">
            <b className="text-psa-ink">{num(data.total.ganhos)}</b> ganhos ÷ <b className="text-psa-ink">{num(data.total.criados)}</b> leads criados
          </span>
        </div>
        <div className="mt-1 text-[11px] text-psa-muted">Coorte por criação: leads criados no período (por dono) que viraram ganho.</div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm border-collapse">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.06em] text-psa-ink-soft border-b border-psa-line">
              <th className="text-left py-2 pr-2">Closer</th>
              <th className="text-right py-2 px-2">Criados</th>
              <th className="text-right py-2 px-2">Ganhos</th>
              <th className="text-left py-2 pl-3 w-[40%]">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.ownerId} className="border-b border-psa-line/60">
                <td className="py-2 pr-2 font-medium text-psa-ink whitespace-nowrap">{r.nome}</td>
                <td className="py-2 px-2 text-right tabular-nums text-psa-ink-soft">{num(r.criados)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-psa-ink">{num(r.ganhos)}</td>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-2.5 rounded-full bg-psa-canvas overflow-hidden">
                      <span className="block h-full rounded-full bg-psa-orange" style={{ width: `${(r.taxa / max) * 100}%` }} />
                    </span>
                    <span className="w-12 text-right text-[11px] tabular-nums font-semibold text-psa-ink">{pct(r.taxa)}</span>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-psa-line font-semibold">
              <td className="py-2 pr-2 text-psa-ink uppercase text-[11px] tracking-wide">Total</td>
              <td className="py-2 px-2 text-right tabular-nums text-psa-ink">{num(data.total.criados)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-psa-ink">{num(data.total.ganhos)}</td>
              <td className="py-2 pl-3 text-[12px] tabular-nums font-bold text-psa-ink">{pct(data.total.taxa)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
