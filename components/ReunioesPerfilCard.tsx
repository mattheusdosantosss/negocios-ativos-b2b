"use client";

import type { ReunioesPerfilData } from "@/lib/hubspot";

const num = (n: number) => n.toLocaleString("pt-BR");

// Cores por status (mesma paleta dos outros cards).
const COLS = [
  { key: "agendada", label: "Agendada", color: "#2563eb" },
  { key: "realizada", label: "Realizada", color: "#1E9E62" },
  { key: "cancelada", label: "Cancelada", color: "#C0432F" },
  { key: "noshow", label: "No-show", color: "#E8A317" },
] as const;

type Props = { data: ReunioesPerfilData; period?: string };

/**
 * Matriz Perfil × status da reunião (Agendada / Realizada / Cancelada / No-show)
 * — reuniões associadas a negócios B2C dos closers, por data da reunião no
 * período selecionado.
 */
export default function ReunioesPerfilCard({ data }: Props) {
  const rows = data.porPerfil;
  const tot = COLS.reduce(
    (acc, c) => ({ ...acc, [c.key]: rows.reduce((s, r) => s + (r[c.key] as number), 0) }),
    {} as Record<string, number>
  );

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Reuniões por perfil</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(data.total)}</span>
            <span className="text-sm text-psa-ink-soft">reuniões · por data da reunião no período</span>
          </div>
          <div className="mt-1 text-[11px] text-psa-muted">
            Associadas a negócios da pipeline B2C dos closers · perfil do negócio
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-psa-ink-soft flex-wrap">
          {COLS.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-psa-ink-soft border-b border-psa-line">
              <th className="text-left py-2 pr-3">Perfil</th>
              {COLS.map((c) => (
                <th key={c.key} className="text-right py-2 px-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: c.color }} />
                    {c.label}
                  </span>
                </th>
              ))}
              <th className="text-right py-2 pl-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-psa-line/60 hover:bg-psa-canvas/40 transition-colors">
                <td className="py-2.5 pr-3 font-medium text-psa-ink">{r.label}</td>
                {COLS.map((c) => (
                  <td key={c.key} className="py-2.5 px-3 text-right tabular-nums" style={{ color: (r[c.key] as number) > 0 ? c.color : undefined }}>
                    {(r[c.key] as number) > 0 ? num(r[c.key] as number) : <span className="text-psa-muted">0</span>}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-psa-ink">{num(r.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-psa-line font-semibold">
              <td className="py-2.5 pr-3 text-psa-ink uppercase text-[11px] tracking-[0.06em]">Total</td>
              {COLS.map((c) => (
                <td key={c.key} className="py-2.5 px-3 text-right tabular-nums font-bold" style={{ color: c.color }}>
                  {num(tot[c.key] ?? 0)}
                </td>
              ))}
              <td className="py-2.5 pl-3 text-right font-extrabold tabular-nums text-psa-ink">{num(data.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
