"use client";

import { useState } from "react";
import type { PropostaMesmoDiaData, PMDDeal } from "@/lib/propostaMesmoDia";

const num = (n: number) => n.toLocaleString("pt-BR");
// Criação e 1ª proposta (flag) são datetimes → fuso BR. `utc` só p/ campos DATE.
const fmtDate = (ms: number | null, utc = false) =>
  ms == null
    ? "—"
    : new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: utc ? "UTC" : "America/Sao_Paulo" });

// Razão "enviou / tinha": X em destaque (escuro), /Y esmaecido.
function Ratio({ comp, elig }: { comp: number; elig: number }) {
  if (elig === 0) return <span className="text-psa-muted">—</span>;
  return (
    <span className="tabular-nums">
      <b className={comp > 0 ? "text-psa-ink" : "text-psa-muted"}>{num(comp)}</b>
      <span className="text-psa-muted">/{num(elig)}</span>
    </span>
  );
}

function DealList({ deals, label }: { deals: PMDDeal[]; label: string }) {
  const okN = deals.filter((d) => d.ok).length;
  return (
    <div className="border-t border-psa-line bg-psa-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-psa-blue">{label}</span>
        <span className="text-[10px] text-psa-muted tabular-nums">
          <b className="text-emerald-700">{okN}</b> no dia / {deals.length}
        </span>
      </div>
      {/* Cabeçalho das colunas */}
      <div className="flex items-center gap-2 px-1.5 pb-1 text-[9px] font-bold uppercase tracking-wide text-psa-muted border-b border-psa-line">
        <span className="w-11 shrink-0" />
        <span className="flex-1 min-w-0">Negócio</span>
        <span className="w-14 text-right shrink-0">Criado</span>
        <span className="w-14 text-right shrink-0">1ª prop.</span>
      </div>
      <div className="divide-y divide-psa-line/60">
        {deals.map((d, i) => (
          <div key={i} className={`flex items-center gap-2 px-1.5 py-1 ${d.ok ? "bg-emerald-50/70" : ""}`}>
            <span
              className={`w-11 shrink-0 text-center text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded ${
                d.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              {d.ok ? "no dia" : "fora"}
            </span>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 truncate text-[12px] text-psa-ink hover:text-psa-blue hover:underline"
              title={d.dealname}
            >
              {d.dealname}
            </a>
            <span className="w-14 text-right shrink-0 text-[11px] tabular-nums text-psa-ink-soft">{fmtDate(d.criadoMs)}</span>
            <span className={`w-14 text-right shrink-0 text-[11px] tabular-nums font-semibold ${d.ok ? "text-emerald-700" : "text-psa-ink-soft"}`}>
              {fmtDate(d.propMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PropostaMesmoDiaCard({ data }: { data: PropostaMesmoDiaData }) {
  const [open, setOpen] = useState<string | null>(null); // ownerId aberto
  const ratioCls = "w-24 sm:w-28 text-right text-[13px] font-semibold";

  return (
    <section className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="w-1 h-4 rounded-full bg-psa-blue" />
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em] text-psa-ink">Proposta no mesmo dia</h2>
        </div>
        <p className="text-[11px] text-psa-ink-soft mt-1">
          Agilidade por closer: de quantas oportunidades ele mandou a proposta no mesmo dia (<b className="text-psa-ink-soft">enviou / teve</b>).{" "}
          <b className="text-psa-ink-soft">Sem reunião</b> conta pelo dia da qualificação; <b className="text-psa-ink-soft">com reunião</b>, pelo dia da reunião.{" "}
          <span className="text-psa-muted">Clique numa linha pra ver os negócios.</span>
        </p>
        <div className="mt-1.5 text-[11px] text-psa-muted">
          Total: <b className="text-psa-ink tabular-nums">{num(data.totalSemComp)}/{num(data.totalSemElig)}</b> sem reunião ·{" "}
          <b className="text-psa-ink tabular-nums">{num(data.totalComComp)}/{num(data.totalComElig)}</b> com reunião
        </div>
      </div>

      <div className="px-5 pb-5 space-y-1.5">
        <div className="flex items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-psa-muted">
          <span className="flex-1">Closer</span>
          <span className="w-24 sm:w-28 text-right">Sem reunião</span>
          <span className="w-24 sm:w-28 text-right">Com reunião</span>
        </div>

        {data.closers.length === 0 && (
          <div className="py-6 text-center text-sm text-psa-ink-soft">Nenhuma qualificação ou reunião no período.</div>
        )}

        {data.closers.map((c) => {
          const aberto = open === c.ownerId;
          const total = c.semElig + c.comElig;
          return (
            <div key={c.ownerId} className="rounded-lg border border-psa-line overflow-hidden">
              <button
                type="button"
                disabled={total === 0}
                onClick={() => setOpen((o) => (o === c.ownerId ? null : c.ownerId))}
                aria-expanded={aberto}
                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-psa-canvas/50 disabled:hover:bg-transparent disabled:cursor-default"
              >
                <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-medium text-psa-ink truncate" title={c.nome}>
                  {total > 0 && <span className={`text-psa-blue text-[10px] transition-transform ${aberto ? "" : "-rotate-90"}`}>▼</span>}
                  <span className="truncate">{c.nome}</span>
                </span>
                <span className={ratioCls}><Ratio comp={c.semComp} elig={c.semElig} /></span>
                <span className={ratioCls}><Ratio comp={c.comComp} elig={c.comElig} /></span>
              </button>
              {aberto && (
                <div>
                  {c.semElig > 0 && <DealList deals={c.dealsSem} label="Sem reunião · proposta no dia da qualificação" />}
                  {c.comElig > 0 && <DealList deals={c.dealsCom} label="Com reunião · proposta no dia da reunião" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
