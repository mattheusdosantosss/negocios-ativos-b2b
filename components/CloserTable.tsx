"use client";

import { useMemo, useState } from "react";
import type { CloserRow } from "@/lib/aggregate";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

// Rótulos curtos pra caber no cabeçalho da tabela (o rótulo completo vira title/tooltip).
const SHORT_LABELS: Record<string, string> = {
  presentationscheduled: "Conexão",
  decisionmakerboughtin: "Reunião",
  contractsent: "Aguard. Proposta",
  closedwon: "Proposta env.",
  closedlost: "Em negoc.",
  "1167445770": "Negoc. avanç.",
  "1367665802": "Resting",
};

type Stage = { id: string; label: string };

type Props = {
  rows: CloserRow[];
  stages: Stage[];
  loading?: boolean;
};

type SortKey = "nome" | "total" | "valor";
type SortDir = "asc" | "desc";

export default function CloserTable({ rows, stages, loading = false }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const handleSort = (key: SortKey) => {
    setSort((cur) => {
      if (cur && cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
      return { key, dir: key === "nome" ? "asc" : "desc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = sort.key === "nome" ? a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) : a[sort.key] - b[sort.key];
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-psa-line last:border-0">
            <span className="skeleton h-4 w-40 inline-block" />
            <span className="skeleton h-4 w-full inline-block" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-psa-line bg-psa-surface shadow-card px-5 py-10 text-center text-sm text-psa-ink-soft">
        Nenhum negócio ativo encontrado nessa pipeline.
      </div>
    );
  }

  const Th = ({ label, col, align = "right", title }: { label: string; col?: SortKey; align?: "left" | "right"; title?: string }) => {
    if (!col) {
      return (
        <th className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`} title={title}>
          <span className="uppercase tracking-[0.06em] text-[10px] text-psa-ink-soft whitespace-nowrap">{label}</span>
        </th>
      );
    }
    const active = sort?.key === col;
    const arrow = active ? (sort!.dir === "asc" ? "▲" : "▼") : "";
    return (
      <th className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-[0.08em] text-[10px] transition-colors ${
            active ? "text-psa-ink" : "text-psa-ink-soft hover:text-psa-ink"
          } ${align === "right" ? "flex-row-reverse" : ""}`}
          title="Ordenar por esta coluna"
        >
          {label}
          <span className="text-[9px] text-psa-orange w-2 inline-block">{arrow}</span>
        </button>
      </th>
    );
  };

  return (
    <>
      {sort && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setSort(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-psa-ink-soft hover:text-psa-ink transition-colors"
          >
            <span className="text-sm leading-none">✕</span>
            Limpar ordenação
          </button>
        </div>
      )}
      <div className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-[11px] font-semibold border-b border-psa-line">
              <Th label="Closer" col="nome" align="left" />
              {stages.map((s) => (
                <Th key={s.id} label={SHORT_LABELS[s.id] ?? s.label} title={s.label} />
              ))}
              <Th label="Total" col="total" />
              <Th label="Valor em aberto" col="valor" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.ownerId} className="border-b border-psa-line last:border-0 hover:bg-psa-canvas/50 transition-colors">
                <td className="px-3 py-3 font-medium text-psa-ink whitespace-nowrap">{r.nome}</td>
                {stages.map((s) => {
                  const count = r.porEtapa[s.id] || 0;
                  return (
                    <td key={s.id} className={`px-3 py-3 text-right tabular-nums ${count > 0 ? "text-psa-ink" : "text-psa-ink-soft/50"}`}>
                      {num(count)}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right font-bold tabular-nums text-psa-orange">{num(r.total)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-psa-ink">{brl(r.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
