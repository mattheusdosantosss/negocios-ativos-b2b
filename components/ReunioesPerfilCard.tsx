"use client";

import { useState } from "react";
import type { ReunioesCell, ReunioesCloser, ReunioesPerfilData, ReunioesStatusId } from "@/lib/hubspot";

const num = (n: number) => n.toLocaleString("pt-BR");

// Colunas (resultado da reunião) — mesma paleta dos outros cards.
const COLS = [
  { key: "agendada", label: "Agendada", color: "#2563eb" },
  { key: "realizada", label: "Realizada", color: "#1E9E62" },
  { key: "cancelada", label: "Cancelada", color: "#C0432F" },
  { key: "noshow", label: "No-show", color: "#E8A317" },
] as const;

// Filtro de status do negócio associado.
const STATUS: { id: ReunioesStatusId | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativo", label: "Ativo" },
  { id: "ganho", label: "Ganho" },
  { id: "perdido", label: "Perdido" },
];

const ALL_STATUS: ReunioesStatusId[] = ["ativo", "ganho", "perdido"];
const zero = (): ReunioesCell => ({ agendada: 0, realizada: 0, cancelada: 0, noshow: 0 });
const add = (a: ReunioesCell, b?: ReunioesCell): ReunioesCell =>
  b ? { agendada: a.agendada + b.agendada, realizada: a.realizada + b.realizada, cancelada: a.cancelada + b.cancelada, noshow: a.noshow + b.noshow } : a;
const cellTotal = (c: ReunioesCell) => c.agendada + c.realizada + c.cancelada + c.noshow;

// Célula de um perfil pra um closer no status selecionado ("todos" = soma dos 3).
function perfilCell(closer: ReunioesCloser, status: ReunioesStatusId | "todos", perfilId: string): ReunioesCell {
  if (status !== "todos") return closer.cube[status][perfilId] ?? zero();
  return ALL_STATUS.reduce((acc, st) => add(acc, closer.cube[st][perfilId]), zero());
}

type Props = { data: ReunioesPerfilData };

/**
 * Reuniões dos closers B2C (dono da reunião) por Closer × Perfil × status do
 * negócio (Ativo/Ganho/Perdido) × resultado (Agendada/Realizada/Cancelada/
 * No-show). Linha por closer, expansível pro detalhe de perfil. Segue período,
 * origem e closer do topo.
 */
export default function ReunioesPerfilCard({ data }: Props) {
  const [status, setStatus] = useState<ReunioesStatusId | "todos">("todos");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Linha somada (todos os perfis) de um closer, no status selecionado.
  const rowOf = (c: ReunioesCloser) => data.perfis.reduce((acc, p) => add(acc, perfilCell(c, status, p.id)), zero());
  // Rodapé (time): soma dos closers.
  const footer = data.closers.reduce((acc, c) => add(acc, rowOf(c)), zero());
  const totalFooter = cellTotal(footer);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Reuniões por closer</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(totalFooter)}</span>
            <span className="text-sm text-psa-ink-soft">reuniões · por data da reunião no período</span>
          </div>
          <div className="mt-1 text-[11px] text-psa-muted">
            Reuniões dos closers B2C · clique no closer pra abrir o detalhe por perfil
          </div>
        </div>

        {/* Seletor de status do negócio */}
        <div className="flex rounded-xl bg-psa-canvas border border-psa-line p-1">
          {STATUS.map((s) => {
            const active = s.id === status;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatus(s.id)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all ${
                  active ? "bg-psa-orange text-white shadow" : "text-psa-ink-soft hover:text-psa-ink"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm border-collapse">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-psa-ink-soft border-b border-psa-line">
              <th className="text-left py-2 pr-3">Closer</th>
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
            {data.closers.map((c) => {
              const row = rowOf(c);
              const rowTot = cellTotal(row);
              const isOpen = open.has(c.ownerId);
              return (
                <FragmentRow
                  key={c.ownerId}
                  closer={c}
                  row={row}
                  rowTot={rowTot}
                  isOpen={isOpen}
                  perfis={data.perfis}
                  status={status}
                  onToggle={() => toggle(c.ownerId)}
                />
              );
            })}
            <tr className="border-t-2 border-psa-line font-semibold">
              <td className="py-2.5 pr-3 text-psa-ink uppercase text-[11px] tracking-[0.06em]">Total do time</td>
              {COLS.map((col) => (
                <td key={col.key} className="py-2.5 px-3 text-right tabular-nums font-bold" style={{ color: col.color }}>
                  {num(footer[col.key])}
                </td>
              ))}
              <td className="py-2.5 pl-3 text-right font-extrabold tabular-nums text-psa-ink">{num(totalFooter)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  closer,
  row,
  rowTot,
  isOpen,
  perfis,
  status,
  onToggle,
}: {
  closer: ReunioesCloser;
  row: ReunioesCell;
  rowTot: number;
  isOpen: boolean;
  perfis: ReunioesPerfilData["perfis"];
  status: ReunioesStatusId | "todos";
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b border-psa-line/60 hover:bg-psa-canvas/40 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2.5 pr-3 font-medium text-psa-ink">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-psa-orange text-[10px] w-3">{isOpen ? "▼" : "▶"}</span>
            {closer.nome}
          </span>
        </td>
        {COLS.map((col) => (
          <td key={col.key} className="py-2.5 px-3 text-right tabular-nums" style={{ color: row[col.key] > 0 ? col.color : undefined }}>
            {row[col.key] > 0 ? num(row[col.key]) : <span className="text-psa-muted">0</span>}
          </td>
        ))}
        <td className="py-2.5 pl-3 text-right font-bold tabular-nums text-psa-ink">{num(rowTot)}</td>
      </tr>
      {isOpen &&
        perfis.map((p) => {
          const cell = perfilCell(closer, status, p.id);
          const t = cellTotal(cell);
          if (t === 0) return null;
          return (
            <tr key={p.id} className="bg-psa-canvas/30 text-[13px]">
              <td className="py-1.5 pr-3 pl-6 text-psa-ink-soft">{p.label}</td>
              {COLS.map((col) => (
                <td key={col.key} className="py-1.5 px-3 text-right tabular-nums" style={{ color: cell[col.key] > 0 ? col.color : undefined }}>
                  {cell[col.key] > 0 ? num(cell[col.key]) : <span className="text-psa-muted">0</span>}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right font-semibold tabular-nums text-psa-ink-soft">{num(t)}</td>
            </tr>
          );
        })}
    </>
  );
}
