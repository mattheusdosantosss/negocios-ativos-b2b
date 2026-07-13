"use client";

import { Fragment, useMemo, useState } from "react";
import { AGING_BUCKETS, ACTIVITY_BUCKETS, type CloserRow } from "@/lib/aggregate";
import AgingFunnel from "./AgingFunnel";

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
  /** Clique numa célula numérica: etapa específica, ou "total" pra todas as etapas do closer. */
  onOpenStage?: (row: CloserRow, stageId: string | "total") => void;
  /** Clique num número da faixa de tempo (dropdown "Tempo desde qualificação"). */
  onOpenAgingBucket?: (row: CloserRow, bucketId: string) => void;
  /** Clique num número da faixa de tempo desde a última atividade. */
  onOpenActivityBucket?: (row: CloserRow, bucketId: string) => void;
  /** Clique na coluna em destaque "Evento atrasado" (só data já passada). */
  onOpenEventoAtrasado?: (row: CloserRow) => void;
};

type SortKey = "nome" | "total" | "valor" | "eventoAtrasado";
type SortDir = "asc" | "desc";

export default function CloserTable({
  rows,
  stages,
  loading = false,
  onOpenStage,
  onOpenAgingBucket,
  onOpenActivityBucket,
  onOpenEventoAtrasado,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);

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
              <th className="px-3 py-3 text-right bg-psa-orange-soft border-l-2 border-psa-orange/40">
                <button
                  type="button"
                  onClick={() => handleSort("eventoAtrasado")}
                  className={`inline-flex flex-row-reverse items-center gap-1 whitespace-nowrap uppercase tracking-[0.08em] text-[10px] transition-colors ${
                    sort?.key === "eventoAtrasado" ? "text-psa-orange" : "text-psa-orange/70 hover:text-psa-orange"
                  }`}
                  title="Ordenar por esta coluna"
                >
                  ⚠ Evento atrasado
                  <span className="text-[9px] text-psa-orange w-2 inline-block">
                    {sort?.key === "eventoAtrasado" ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const expanded = expandedOwnerId === r.ownerId;
              return (
              <Fragment key={r.ownerId}>
              <tr className="border-b border-psa-line last:border-0 hover:bg-psa-canvas/50 transition-colors">
                <td className="px-3 py-3 font-medium text-psa-ink whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setExpandedOwnerId(expanded ? null : r.ownerId)}
                    className="inline-flex items-center gap-1.5 hover:text-psa-orange transition-colors"
                    title="Ver tempo desde a qualificação e desde a última atividade"
                  >
                    <span className={`text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                    {r.nome}
                  </button>
                </td>
                {stages.map((s) => {
                  const count = r.porEtapa[s.id] || 0;
                  const clickable = count > 0 && !!onOpenStage;
                  return (
                    <td key={s.id} className="px-3 py-3 text-right tabular-nums">
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => onOpenStage!(r, s.id)}
                          className="text-psa-ink hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60"
                          title={`Ver negócios de ${r.nome} em "${s.label}"`}
                        >
                          {num(count)}
                        </button>
                      ) : (
                        <span className={count > 0 ? "text-psa-ink" : "text-psa-ink-soft/50"}>{num(count)}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right font-bold tabular-nums text-psa-orange">
                  {r.total > 0 && onOpenStage ? (
                    <button
                      type="button"
                      onClick={() => onOpenStage(r, "total")}
                      className="hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60"
                      title={`Ver todos os negócios ativos de ${r.nome}`}
                    >
                      {num(r.total)}
                    </button>
                  ) : (
                    num(r.total)
                  )}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-psa-ink">
                  {r.total > 0 && onOpenStage ? (
                    <button
                      type="button"
                      onClick={() => onOpenStage(r, "total")}
                      className="hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60"
                      title={`Ver todos os negócios ativos de ${r.nome}`}
                    >
                      {brl(r.valor)}
                    </button>
                  ) : (
                    brl(r.valor)
                  )}
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums bg-psa-orange-soft border-l-2 border-psa-orange/40">
                  {r.eventoAtrasado > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenEventoAtrasado?.(r)}
                      disabled={!onOpenEventoAtrasado}
                      className="text-psa-orange hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60"
                      title={`Ver negócios de ${r.nome} com Data Prevista do Evento já passada`}
                    >
                      {num(r.eventoAtrasado)}
                    </button>
                  ) : (
                    <span className="text-psa-ink-soft/40">{num(r.eventoAtrasado)}</span>
                  )}
                </td>
              </tr>
              {expanded && (
                <tr className="border-b border-psa-line last:border-0 bg-psa-canvas/40">
                  <td colSpan={stages.length + 4} className="px-5 py-4 space-y-5">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft mb-3">
                        Tempo desde a qualificação · {r.nome}
                      </div>
                      <AgingFunnel
                        buckets={AGING_BUCKETS}
                        porFaixa={r.porFaixa}
                        onOpenBucket={onOpenAgingBucket ? (bucketId) => onOpenAgingBucket(r, bucketId) : undefined}
                        criticalBucketId="40+"
                        criticalLabel="acima do ciclo"
                        criticalHint="Acima do ciclo de vendas (~20-25 dias)"
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft mb-3">
                        Tempo desde a última atividade · {r.nome}
                      </div>
                      <AgingFunnel
                        buckets={ACTIVITY_BUCKETS}
                        porFaixa={r.porAtividade}
                        onOpenBucket={
                          onOpenActivityBucket ? (bucketId) => onOpenActivityBucket(r, bucketId) : undefined
                        }
                        criticalBucketId="16+"
                        criticalLabel="sem contato"
                        criticalHint="Mais de 15 dias sem nota, ligação, e-mail, reunião ou tarefa registrada"
                      />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
