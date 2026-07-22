"use client";

import { useState } from "react";
import TemperatureStacked from "./TemperatureStacked";
import type { CloserRow } from "@/lib/aggregate";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

type Stage = { id: string; label: string };

type Props = {
  closers: CloserRow[];
  /** Etapas da visão de temperatura (mesmas do card geral). */
  tempStages: Stage[];
  /** Clique num segmento (etapa + temperatura) de um closer. */
  onOpenTemp: (row: CloserRow, stageId: string, tempId: string) => void;
  /** Ver todos os negócios ativos do closer. */
  onOpenTotal: (row: CloserRow) => void;
};

export default function CloserOpenDeals({ closers, tempStages, onOpenTemp, onOpenTotal }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = [...closers].sort((a, b) => b.total - a.total || b.valor - a.valor);

  if (rows.length === 0) {
    return <div className="text-sm text-psa-ink-soft">Nenhum negócio ativo.</div>;
  }

  return (
    <div className="divide-y divide-psa-line">
      {rows.map((c, i) => {
        const isOpen = openId === c.ownerId;
        return (
          <div key={c.ownerId}>
            <div className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : c.ownerId)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
                aria-expanded={isOpen}
                title={isOpen ? "Recolher" : "Ver por temperatura"}
              >
                <span
                  className={`text-psa-ink-soft text-xs leading-none transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                <span className="text-[11px] font-mono text-psa-ink-soft tabular-nums w-6">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-psa-ink truncate">
                  {c.nome}
                  {!c.inTeam && (
                    <span className="ml-2 text-[9px] uppercase tracking-wider text-psa-muted">fora do time</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenTotal(c)}
                className="text-sm font-bold text-psa-ink tabular-nums hover:text-psa-orange whitespace-nowrap"
                title="Ver todos os negócios ativos do closer"
              >
                {num(c.total)} <span className="text-[11px] font-normal text-psa-ink-soft">ativos ↗</span>
              </button>
              <span className="w-32 text-right text-xs text-psa-ink-soft tabular-nums whitespace-nowrap">
                {brl(c.valor)}
              </span>
            </div>
            {isOpen && (
              <div className="pb-4 pl-9 pr-1">
                <TemperatureStacked
                  stages={tempStages}
                  matrix={c.tempPorEtapa}
                  compact
                  onOpen={(stageId, tempId) => onOpenTemp(c, stageId, tempId)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
