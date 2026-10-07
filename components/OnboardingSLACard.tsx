"use client";

import { useState } from "react";
import type { OnboardingSLAData } from "@/lib/onboarding";

const num = (n: number) => n.toLocaleString("pt-BR");
const fmtDate = (ms: number | null) =>
  ms == null ? "—" : new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * SLA de Onboarding (B2B): negócios parados na etapa "Aguardando Onboarding" há
 * mais de X dias desde que entraram em "Negócio fechado". Passou do prazo =
 * atrasado. Lista ordenada do mais atrasado pro menos.
 */
export default function OnboardingSLACard({ data }: { data: OnboardingSLAData }) {
  const [showAll, setShowAll] = useState(false);
  const pct = data.total > 0 ? Math.round((data.atrasados / data.total) * 100) : 0;
  const lista = showAll ? data.deals : data.deals.slice(0, 8);

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">SLA de Onboarding</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-red-600 tabular-nums">{num(data.atrasados)}</span>
            <span className="text-sm text-psa-ink-soft">
              atrasados de {num(data.total)} em {data.stageLabel}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-psa-ink-soft max-w-2xl">
            Negócios parados em {data.stageLabel} há mais de <b className="text-psa-ink-soft">{data.prazoDias} dias</b> desde que entraram em Negócio fechado ou Aguardando Onboarding (o que for mais antigo).
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-psa-line bg-psa-canvas/50 px-3 py-2 text-right">
          <div className="font-display text-2xl font-extrabold text-red-600 tabular-nums">{pct}%</div>
          <div className="text-[10px] text-psa-muted uppercase tracking-wide">atrasados</div>
        </div>
      </div>

      {data.total === 0 ? (
        <div className="mt-4 py-6 text-center text-sm text-psa-ink-soft">Nenhum negócio em {data.stageLabel}.</div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 px-3 text-[10px] font-bold uppercase tracking-wide text-psa-muted">
            <span className="w-16 shrink-0">Status</span>
            <span className="flex-1">Negócio</span>
            <span className="w-28 text-right hidden sm:block">Closer</span>
            <span className="w-16 text-right">Fechou</span>
            <span className="w-14 text-right">Dias</span>
          </div>
          <div className="mt-1 divide-y divide-psa-line/60">
            {lista.map((d, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-1.5 ${d.atrasado ? "bg-red-50/60" : ""}`}>
                <span className={`w-16 shrink-0 text-center text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded ${d.atrasado ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {d.atrasado ? "atrasado" : "no prazo"}
                </span>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 truncate text-[12px] text-psa-ink hover:text-psa-orange hover:underline"
                  title={d.dealname}
                >
                  {d.dealname}
                </a>
                <span className="w-28 text-right text-[11px] text-psa-ink-soft truncate hidden sm:block" title={d.closer}>{d.closer}</span>
                <span className="w-16 text-right text-[11px] tabular-nums text-psa-ink-soft">{fmtDate(d.fechouMs)}</span>
                <span className={`w-14 text-right text-[12px] tabular-nums font-semibold ${d.atrasado ? "text-red-600" : "text-psa-ink"}`}>{d.dias ?? "—"}</span>
              </div>
            ))}
          </div>
          {data.deals.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full text-center text-[11px] font-medium text-psa-orange hover:underline"
            >
              {showAll ? "Ver menos" : `Ver todos (${num(data.deals.length)})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
