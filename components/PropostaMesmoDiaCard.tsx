"use client";

import { useState } from "react";
import type { PropostaMesmoDiaData, PMDDeal } from "@/lib/propostaMesmoDia";

const num = (n: number) => n.toLocaleString("pt-BR");

function DealList({ deals, label }: { deals: PMDDeal[]; label: string }) {
  return (
    <div className="border-t border-psa-line bg-psa-canvas/40 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-psa-muted mb-1">{label}</div>
      <ul className="space-y-0.5">
        {deals.map((d, i) => (
          <li key={i}>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-psa-ink-soft hover:text-psa-blue hover:underline truncate block"
              title={d.dealname}
            >
              {d.dealname}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PropostaMesmoDiaCard({ data }: { data: PropostaMesmoDiaData }) {
  const [open, setOpen] = useState<string | null>(null); // "ownerId:sem" | "ownerId:com"
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));

  const numCls =
    "w-24 sm:w-28 text-right tabular-nums text-[13px] font-semibold text-psa-ink hover:text-psa-blue hover:underline disabled:text-psa-muted disabled:no-underline disabled:cursor-default";

  return (
    <section className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-1 h-4 rounded-full bg-psa-blue" />
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em] text-psa-ink">Proposta no mesmo dia</h2>
        </div>
        <p className="text-[11px] text-psa-ink-soft mt-1">
          Propostas enviadas no mesmo dia — <b className="text-psa-ink-soft">sem reunião</b> conta no dia da qualificação;{" "}
          <b className="text-psa-ink-soft">com reunião</b>, no dia da reunião. Por closer. (1ª proposta anexada)
        </p>
        <div className="mt-1.5 text-[11px] text-psa-muted">
          Total: <b className="text-psa-ink tabular-nums">{num(data.totalSem)}</b> sem reunião ·{" "}
          <b className="text-psa-ink tabular-nums">{num(data.totalCom)}</b> com reunião
        </div>
      </div>

      <div className="px-5 pb-5 space-y-1.5">
        <div className="flex items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-psa-muted">
          <span className="flex-1">Closer</span>
          <span className="w-24 sm:w-28 text-right">Sem reunião</span>
          <span className="w-24 sm:w-28 text-right">Com reunião</span>
        </div>

        {data.closers.length === 0 && (
          <div className="py-6 text-center text-sm text-psa-ink-soft">Nenhuma proposta no mesmo dia no período.</div>
        )}

        {data.closers.map((c) => (
          <div key={c.ownerId} className="rounded-lg border border-psa-line overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 text-[13px] font-medium text-psa-ink truncate" title={c.nome}>{c.nome}</span>
              <button type="button" disabled={c.sem === 0} onClick={() => toggle(c.ownerId + ":sem")} className={numCls}>
                {num(c.sem)}
              </button>
              <button type="button" disabled={c.com === 0} onClick={() => toggle(c.ownerId + ":com")} className={numCls}>
                {num(c.com)}
              </button>
            </div>
            {open === c.ownerId + ":sem" && c.sem > 0 && (
              <DealList deals={c.dealsSem} label="Sem reunião · proposta no dia da qualificação" />
            )}
            {open === c.ownerId + ":com" && c.com > 0 && (
              <DealList deals={c.dealsCom} label="Com reunião · proposta no dia da reunião" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
