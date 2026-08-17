"use client";

import { Fragment, useMemo, useState } from "react";
import type { FarmerRow } from "@/lib/farmer/aggregate";
import type { ModalKind } from "@/components/farmer/DrillModal";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const nota2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Cor da nota (lead score) por faixa.
const notaColor = (n: number) =>
  n < 7 ? "#DC2626" : n < 8 ? "#f97316" : n < 9 ? "#fde047" : n < 11 ? "#4ADE80" : "#16A34A";

type Props = {
  rows: FarmerRow[];
  loading?: boolean;
  csAtivo?: boolean;
  onDrillDown?: (farmer: FarmerRow, kind: ModalKind, stage?: string) => void;
  /** Rótulos das etapas B2B na ordem do funil (gráfico por etapa no expander). */
  stageOrder?: string[];
};

// Painel expandido: detalhe completo do farmer (demandas por origem, negócios,
// tramitações e reuniões) + gráfico de negócios por etapa do funil.
function DetailPanel({
  f,
  stageOrder,
  onOpen,
}: {
  f: FarmerRow;
  stageOrder: string[];
  onOpen?: (kind: ModalKind, stage?: string) => void;
}) {
  // Distribuição das demandas do farmer por etapa, segmentada por origem.
  type StageAgg = {
    carteira: number;
    acao_crm: number;
    acao_crm_carteira: number;
    indicacao: number;
    palestrante: number;
    qualif_farmer: number;
    foraMoa: number;
    total: number;
  };
  const byStage = new Map<string, StageAgg>();
  for (const d of f.demandasDeals) {
    const s = d.stage || "—";
    const e = byStage.get(s) ?? { carteira: 0, acao_crm: 0, acao_crm_carteira: 0, indicacao: 0, palestrante: 0, qualif_farmer: 0, foraMoa: 0, total: 0 };
    e.total += 1;
    if (d.foraMoa) e.foraMoa += 1; // Fora do MOA vira segmento próprio (não conta na origem)
    else if (d.origemBucket) e[d.origemBucket] += 1;
    byStage.set(s, e);
  }
  const foraMoaTotal = f.demandasDeals.filter((d) => d.foraMoa).length;
  // Empresas únicas das demandas: dedupa por companyId; demanda sem empresa
  // (inclui B2C) conta 1; Fora do MOA não conta. Mesma regra do card de meta.
  const empresasUnicas = (() => {
    const deals = f.demandasDeals.filter((d) => !d.foraMoa);
    const comp = new Set(deals.filter((d) => d.companyId).map((d) => d.companyId));
    const semEmpresa = deals.filter((d) => !d.companyId).length;
    return comp.size + semEmpresa;
  })();
  const stages = [
    ...stageOrder.filter((s) => byStage.has(s)),
    ...[...byStage.keys()].filter((s) => !stageOrder.includes(s)),
  ];
  const maxTotal = Math.max(1, ...stages.map((s) => byStage.get(s)!.total));

  const SEG = [
    { key: "carteira" as const, label: "Carteira", cls: "bg-psa-blue" },
    { key: "acao_crm" as const, label: "Ação de CRM", cls: "bg-psa-orange" },
    { key: "acao_crm_carteira" as const, label: "Ação de CRM (Carteira)", cls: "bg-cyan-500" },
    { key: "indicacao" as const, label: "Indicação", cls: "bg-emerald-500" },
    { key: "palestrante" as const, label: "Palestrante", cls: "bg-violet-500" },
    { key: "qualif_farmer" as const, label: "Qualif. Farmer", cls: "bg-psa-muted" },
  ];

  const item = (label: string, value: string, onClick?: () => void) => (
    <div className="flex justify-between gap-2">
      <span className="text-psa-ink-soft">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="font-semibold tabular-nums text-psa-ink hover:text-psa-orange hover:underline underline-offset-2"
          title="Ver lista"
        >
          {value}
        </button>
      ) : (
        <span className="font-semibold tabular-nums text-psa-ink">{value}</span>
      )}
    </div>
  );
  const groupCls = "rounded-lg border border-psa-line bg-psa-surface p-3 space-y-1";
  const titleCls = "text-[10px] font-bold uppercase tracking-[0.08em] text-psa-orange mb-1";
  return (
    <div className="space-y-3">
    {stages.length > 0 && (
      <div className="rounded-lg border border-psa-line bg-psa-surface p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={titleCls}>Negócios por etapa (demandas)</div>
          <div className="flex items-center gap-3 text-[10px] text-psa-ink-soft">
            {SEG.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-sm ${s.cls}`} />
                {s.label}
              </span>
            ))}
            {foraMoaTotal > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />
                Fora do MOA (não conta)
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2 mt-2">
          {stages.map((s) => {
            const e = byStage.get(s)!;
            return (
              <button
                key={s}
                type="button"
                onClick={onOpen ? () => onOpen("demandas", s) : undefined}
                className={`block w-full text-left ${onOpen ? "cursor-pointer group/etapa" : "cursor-default"}`}
                title="Ver demandas desta etapa"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs mb-0.5">
                  <span className="truncate text-psa-ink font-medium group-hover/etapa:text-psa-orange group-hover/etapa:underline" title={s}>{s}</span>
                  <span className="shrink-0 text-psa-ink-soft">
                    <span className="font-bold text-psa-ink tabular-nums">{e.total}</span> ativos
                  </span>
                </div>
                {/* trilho: largura ∝ volume da etapa; segmentos ∝ origem dentro da etapa */}
                <div className="h-4 rounded bg-psa-canvas overflow-hidden">
                  <div className="flex h-full" style={{ width: `${(e.total / maxTotal) * 100}%` }}>
                    {SEG.map((seg) =>
                      e[seg.key] > 0 ? (
                        <div
                          key={seg.key}
                          className={`h-full ${seg.cls} flex items-center justify-center text-[9px] font-bold text-white`}
                          style={{ width: `${(e[seg.key] / e.total) * 100}%` }}
                          title={`${seg.label}: ${e[seg.key]}`}
                        >
                          {e[seg.key] >= 2 ? e[seg.key] : ""}
                        </div>
                      ) : null
                    )}
                    {e.foraMoa > 0 && (
                      <div
                        className="h-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ width: `${(e.foraMoa / e.total) * 100}%` }}
                        title={`Fora do MOA (não conta): ${e.foraMoa}`}
                      >
                        {e.foraMoa >= 2 ? e.foraMoa : ""}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
      <div className={groupCls}>
        <div className={titleCls}>Demandas levantadas</div>
        <div className="flex justify-between gap-2 pb-1 mb-1 border-b border-psa-line/60">
          <span className="text-psa-ink-soft">Empresas únicas</span>
          {onOpen && empresasUnicas > 0 ? (
            <button
              type="button"
              onClick={() => onOpen("empresas_unicas")}
              className="font-bold tabular-nums text-psa-ink hover:text-psa-orange hover:underline underline-offset-2"
              title="Ver empresas únicas (negócios da mesma empresa contam 1; sem empresa conta 1)"
            >
              {num(empresasUnicas)}
            </button>
          ) : (
            <span className="font-bold tabular-nums text-psa-ink" title="Negócios da mesma empresa contam 1; sem empresa (inclui B2C) conta 1">{num(empresasUnicas)}</span>
          )}
        </div>
        {item("Carteira", num(f.demandasCarteira))}
        {item("Ação de CRM", num(f.demandasAcaoCrm))}
        {item("Ação de CRM (Carteira)", num(f.demandasAcaoCrmCarteira))}
        {item("Indicação", num(f.demandasIndicacao))}
        {item("Palestrante", num(f.demandasPalestrante))}
        {item("Qualificação Farmer", num(f.demandasQualifFarmer))}
        {item("Em aberto", num(f.emAberto))}
        {foraMoaTotal > 0 && (
          <div className="flex justify-between gap-2 pt-1 mt-1 border-t border-psa-line/60">
            <span className="text-red-600">Fora do MOA (não conta)</span>
            <span className="font-semibold tabular-nums text-red-600">{num(foraMoaTotal)}</span>
          </div>
        )}
      </div>
      <div className={groupCls}>
        <div className={titleCls}>Negócios fechados</div>
        {item("Fechados (ganhos)", num(f.negocios), onOpen && f.negocios > 0 ? () => onOpen("negocios") : undefined)}
        {item("Perdidos", num(f.perdidos), onOpen && f.perdidos > 0 ? () => onOpen("perdidos") : undefined)}
        {item("Receita", brl(f.receita), onOpen && f.negocios > 0 ? () => onOpen("receita") : undefined)}
      </div>
      <div className={groupCls}>
        <div className={titleCls}>Tramitações</div>
        {item("Em andamento", num(f.tramitacoes), onOpen && f.tramitacoes > 0 ? () => onOpen("tramitacoes") : undefined)}
        {item("Criadas no mês", num(f.tramitacoesCriadas), onOpen && f.tramitacoesCriadas > 0 ? () => onOpen("tramitacoes_criadas") : undefined)}
      </div>
      <div className={groupCls}>
        <div className={titleCls}>Reuniões</div>
        {item("Realizadas", num(f.reunioesRealizadas), onOpen && f.reunioesRealizadas > 0 ? () => onOpen("reunioes_realizadas") : undefined)}
        {item("Agendadas", num(f.reunioesAgendadas), onOpen && f.reunioesAgendadas > 0 ? () => onOpen("reunioes_agendadas") : undefined)}
      </div>
    </div>
    </div>
  );
}

// Chaves ordenáveis: "nome" (alfabética) ou as métricas numéricas.
type SortKey = "nome" | "demandas" | "notaMedia" | "negocios" | "perdidos" | "receita" | "tramitacoes";
type SortDir = "asc" | "desc";

// Célula numérica clicável → abre o drill-down daquele farmer/métrica.
function Cell({
  count,
  display,
  color,
  onClick,
}: {
  count: number;
  display: string;
  color: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick && count > 0;
  if (!clickable) {
    return <span className={`tabular-nums ${color}`}>{display}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tabular-nums ${color} hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60`}
      title="Ver lista no HubSpot"
    >
      {display}
    </button>
  );
}

export default function FarmerTable({ rows, loading = false, csAtivo = true, onDrillDown, stageOrder = [] }: Props) {
  // Ordenação: null = ordem padrão que vem da API (por receita, maior primeiro).
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  // Linhas expandidas (detalhe completo do farmer).
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const colSpan = csAtivo ? 7 : 6;

  const handleSort = (key: SortKey) => {
    setSort((cur) => {
      if (cur && cur.key === key) {
        // Mesmo campo → inverte a direção
        return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
      }
      // Campo novo → Farmer começa A→Z; números começam do maior pro menor
      return { key, dir: key === "nome" ? "asc" : "desc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows; // ordem padrão (vem ordenada por receita da API)
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sort.key === "nome") {
        cmp = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      } else {
        cmp = a[sort.key] - b[sort.key];
      }
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
            <span className="skeleton h-4 w-12 inline-block ml-auto" />
            <span className="skeleton h-4 w-12 inline-block" />
            <span className="skeleton h-4 w-24 inline-block" />
            <span className="skeleton h-4 w-12 inline-block" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-psa-line bg-psa-surface shadow-card px-5 py-10 text-center text-sm text-psa-ink-soft">
        Nenhum farmer com dados neste período.
      </div>
    );
  }

  // Cabeçalho clicável com indicador de ordenação (▲/▼).
  const Th = ({ label, col, align = "right" }: { label: string; col: SortKey; align?: "left" | "right" }) => {
    const active = sort?.key === col;
    const arrow = active ? (sort!.dir === "asc" ? "▲" : "▼") : "";
    return (
      <th className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-[0.08em] transition-colors ${
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
            title="Voltar à ordem padrão (por receita)"
          >
            <span className="text-sm leading-none">✕</span>
            Limpar ordenação
          </button>
        </div>
      )}
      <div className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-[11px] font-semibold border-b border-psa-line">
            <Th label="Farmer" col="nome" align="left" />
            <Th label="Demandas levantadas" col="demandas" />
            <Th label="Nota" col="notaMedia" />
            <Th label="Negócios fechados" col="negocios" />
            <Th label="Negócios perdidos" col="perdidos" />
            <Th label="Receita" col="receita" />
            {csAtivo && <Th label="Tramitações em andamento" col="tramitacoes" />}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((f) => {
            const open = openIds.has(f.ownerId);
            return (
            <Fragment key={f.ownerId}>
            <tr className="border-b border-psa-line last:border-0 hover:bg-psa-canvas/50 transition-colors">
              <td className="px-5 py-3 font-medium text-psa-ink">
                <button
                  type="button"
                  onClick={() => toggleOpen(f.ownerId)}
                  className="mr-2 text-psa-ink-soft hover:text-psa-ink align-middle"
                  aria-label={open ? "Recolher detalhes" : "Ver detalhes"}
                  title="Ver detalhes"
                >
                  <span className={`inline-block text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                </button>
                {f.nome}
              </td>
              <td className="px-5 py-3 text-right font-semibold">
                <Cell
                  count={f.demandas}
                  display={num(f.demandas)}
                  color="text-psa-blue"
                  onClick={onDrillDown ? () => onDrillDown(f, "demandas") : undefined}
                />
              </td>
              <td
                className="px-5 py-3 text-right font-bold tabular-nums"
                style={{ color: notaColor(f.notaMedia) }}
                title="Média do lead score (0–12)"
              >
                {nota2(f.notaMedia)}
              </td>
              <td className="px-5 py-3 text-right font-semibold">
                <Cell
                  count={f.negocios}
                  display={num(f.negocios)}
                  color="text-psa-orange"
                  onClick={onDrillDown ? () => onDrillDown(f, "negocios") : undefined}
                />
              </td>
              <td className="px-5 py-3 text-right font-semibold">
                <Cell
                  count={f.perdidos}
                  display={num(f.perdidos)}
                  color="text-psa-ink-soft"
                  onClick={onDrillDown ? () => onDrillDown(f, "perdidos") : undefined}
                />
              </td>
              <td className="px-5 py-3 text-right font-semibold">
                <Cell
                  count={f.negocios}
                  display={brl(f.receita)}
                  color="text-psa-ink"
                  onClick={onDrillDown ? () => onDrillDown(f, "receita") : undefined}
                />
              </td>
              {csAtivo && (
                <td className="px-5 py-3 text-right">
                  <Cell
                    count={f.tramitacoes}
                    display={num(f.tramitacoes)}
                    color="text-psa-ink-soft"
                    onClick={onDrillDown ? () => onDrillDown(f, "tramitacoes") : undefined}
                  />
                </td>
              )}
            </tr>
            {open && (
              <tr>
                <td colSpan={colSpan} className="px-5 pb-4 pt-1 bg-psa-canvas/40 border-b border-psa-line">
                  <DetailPanel
                    f={f}
                    stageOrder={stageOrder}
                    onOpen={onDrillDown ? (kind, stage) => onDrillDown(f, kind, stage) : undefined}
                  />
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
