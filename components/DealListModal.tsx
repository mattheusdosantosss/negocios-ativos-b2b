"use client";

import { useEffect } from "react";
import type { AggregatedDealItem, DateField, DealLite } from "@/lib/aggregate";

// Rótulo curto (cabeçalho da coluna de data) + descrição (linha explicativa).
const DATE_FIELD_INFO: Record<DateField, { short: string; long: string }> = {
  createdate: { short: "Criação", long: "Data de criação do negócio" },
  qualdate: { short: "Qualificação", long: "Data de qualificação" },
  activitydate: { short: "Últ. atividade", long: "Data da última atividade registrada" },
  eventdate: { short: "Evento", long: "Data prevista do evento" },
  meetingdate: { short: "Reunião", long: "Data da 1ª reunião concluída com o closer" },
  closedate: { short: "Fechamento", long: "Data em que virou Ganho/Perdido" },
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Ex.: "Rafael Teixeira". Omitido no modo agregado (todos os closers de uma etapa). */
  closerName?: string;
  /** Ex.: "Em negociação" ou "Todos os negócios ativos" */
  stageLabel: string;
  deals: Array<DealLite | AggregatedDealItem>;
  /** Qual data mostrar ao lado do valor. Default: data de criação. */
  dateField?: DateField;
  /** Quando true, usa o valor líquido (-10%) em vez do bruto. */
  netValue?: boolean;
};

const ownerOf = (d: DealLite | AggregatedDealItem): string | null =>
  (d as AggregatedDealItem).ownerName ?? null;

export default function DealListModal({
  open,
  onClose,
  closerName,
  stageLabel,
  deals,
  dateField = "createdate",
  netValue = false,
}: Props) {
  const valueOf = (d: DealLite | AggregatedDealItem) => (netValue ? d.valorLiquido : d.amount);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const total = deals.length;
  const valorTotal = deals.reduce((s, d) => s + valueOf(d), 0);
  const dateInfo = DATE_FIELD_INFO[dateField];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-modal-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="deal-modal-title" className="font-display text-xl font-bold truncate">
                {stageLabel}
              </h3>
              <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
                {closerName ? `${closerName} · ` : ""}
                {total} {total === 1 ? "negócio" : "negócios"}
              </div>
              <div className="mt-1 text-[11px] text-white/50">
                Data ao lado do valor: <span className="text-white/75 font-medium">{dateInfo.long}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {total > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Negócios</div>
                <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">{total}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Valor Total · {netValue ? "líquido" : "bruto"}</div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(valorTotal)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {total === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhum negócio encontrado.</div>
          ) : (
            // Blocado por closer, no padrão do "Histórico de vendas": cabeçalho do
            // closer (nome + total + nº) e os negócios indentados abaixo.
            <div className="divide-y divide-white/10">
              {(() => {
                const groups = new Map<string, Array<DealLite | AggregatedDealItem>>();
                for (const d of deals) {
                  const name = ownerOf(d) || closerName || "Sem closer";
                  if (!groups.has(name)) groups.set(name, []);
                  groups.get(name)!.push(d);
                }
                return [...groups.entries()]
                  .map(([name, ds]) => ({ name, ds, total: ds.reduce((s, d) => s + valueOf(d), 0) }))
                  .sort((a, b) => b.total - a.total)
                  .map((g) => (
                    <div key={g.name} className="px-6 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-white/90 truncate">{g.name}</span>
                        <span className="text-[11px] text-white/60 whitespace-nowrap">
                          <b className="text-white tabular-nums">{brl(g.total)}</b> · {g.ds.length}{" "}
                          {g.ds.length === 1 ? "negócio" : "negócios"}
                        </span>
                      </div>
                      <ul className="mt-1.5 pl-3 border-l-2 border-psa-orange/30 space-y-1">
                        {g.ds.map((d) => {
                          const hasLink = !!d.url;
                          const row = (
                            <>
                              <span
                                className={`flex-1 min-w-0 truncate text-white/75 ${
                                  hasLink ? "group-hover:text-psa-orange group-hover:underline" : ""
                                }`}
                              >
                                {d.dealname}
                              </span>
                              <span className="shrink-0 flex items-center gap-3">
                                <span className="text-white/45 tabular-nums" title={dateInfo.long}>
                                  {fmtDate(d[dateField])}
                                </span>
                                <span className="text-psa-orange tabular-nums whitespace-nowrap">{brl(valueOf(d))}</span>
                              </span>
                            </>
                          );
                          return (
                            <li key={d.id} className="text-[11px]">
                              {hasLink ? (
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group flex items-center gap-3"
                                  title="Abrir negócio no HubSpot"
                                >
                                  {row}
                                </a>
                              ) : (
                                <div className="group flex items-center gap-3 opacity-80" title="Dado de exemplo">
                                  {row}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
