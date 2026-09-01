"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { FarmerRow } from "@/lib/farmer/aggregate";
import type { ModalKind } from "@/components/farmer/DrillModal";
import type { CarteiraEmpresa } from "@/lib/farmer/hubspot";
import CarteiraModal from "@/components/farmer/CarteiraModal";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const nota2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Cor da nota (lead score) por faixa.
const notaColor = (n: number) =>
  n < 7 ? "#DC2626" : n < 8 ? "#f97316" : n < 9 ? "#fde047" : n < 11 ? "#4ADE80" : "#16A34A";

type CarteiraMap = Record<string, { carteira: number; completo: number }> | null;

// Empresas únicas das demandas do farmer: dedupa por companyId; demanda sem
// empresa (inclui B2C) conta 1; Fora do MOA não conta. Mesma regra do card de meta.
const empresasUnicasDe = (f: FarmerRow) => {
  const deals = f.demandasDeals.filter((d) => !d.foraMoa);
  const comp = new Set(deals.filter((d) => d.companyId).map((d) => d.companyId));
  const semEmpresa = deals.filter((d) => !d.companyId).length;
  return comp.size + semEmpresa;
};

type Props = {
  rows: FarmerRow[];
  loading?: boolean;
  csAtivo?: boolean;
  onDrillDown?: (farmer: FarmerRow, kind: ModalKind, stage?: string) => void;
  /** Rótulos das etapas B2B na ordem do funil (gráfico por etapa no expander). */
  stageOrder?: string[];
  /** Carteira (perfil completo) por ownerId. null = ainda carregando (snapshot à parte). */
  carteiraByOwner?: CarteiraMap;
};

// Painel expandido: detalhe completo do farmer (demandas por origem, negócios,
// tramitações e reuniões) + gráfico de negócios por etapa do funil.
function DetailPanel({
  f,
  stageOrder,
  onOpen,
  carteiraByOwner,
}: {
  f: FarmerRow;
  stageOrder: string[];
  onOpen?: (kind: ModalKind, stage?: string) => void;
  carteiraByOwner?: CarteiraMap;
}) {
  // Drill-down da carteira (empresas + o que falta) — carregado sob demanda ao
  // clicar num dos pills. Cacheado no state do painel após a 1ª busca.
  const [carteiraModal, setCarteiraModal] = useState<"completos" | "pendentes" | null>(null);
  const [carteiraDetalhe, setCarteiraDetalhe] = useState<CarteiraEmpresa[] | null>(null);
  const openCarteira = (filtro: "completos" | "pendentes") => {
    setCarteiraModal(filtro);
    if (carteiraDetalhe === null) {
      const key = new URLSearchParams(window.location.search).get("key") || "";
      fetch(`/api/farmer/carteira/detalhe?owner=${encodeURIComponent(f.ownerId)}${key ? `&key=${encodeURIComponent(key)}` : ""}`)
        .then((r) => r.json())
        .then((j) => setCarteiraDetalhe(j?.companies ?? []))
        .catch(() => setCarteiraDetalhe([]));
    }
  };

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
  const empresasUnicas = empresasUnicasDe(f);
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

  const tileCls = "rounded-xl border border-psa-line bg-psa-surface p-4 flex flex-col transition-all";
  const tileClickCls = `${tileCls} cursor-pointer hover:border-psa-orange/50 hover:shadow-card hover:bg-psa-canvas/30`;
  // Props do card clicável (o card TODO abre a lista principal). Sub-itens usam
  // stopPropagation pra abrir a lista específica sem disparar o card.
  const cardProps = (onClick?: () => void): {
    className: string;
    onClick?: () => void;
    role?: "button";
    tabIndex?: number;
    onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
  } =>
    onClick
      ? {
          className: tileClickCls,
          onClick,
          role: "button",
          tabIndex: 0,
          onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } },
        }
      : { className: tileCls };
  const accentText: Record<string, string> = { blue: "text-psa-blue", orange: "text-psa-orange", emerald: "text-emerald-600", slate: "text-slate-600", cyan: "text-cyan-600" };
  const accentDot: Record<string, string> = { blue: "bg-psa-blue", orange: "bg-psa-orange", emerald: "bg-emerald-500", slate: "bg-slate-500", cyan: "bg-cyan-500" };
  // Cabeçalho do tile: dot colorido + label (padrão único p/ todos os cards).
  const head = (label: string, accent: string) => (
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className={`w-1.5 h-1.5 rounded-full ${accentDot[accent]}`} />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">{label}</span>
    </div>
  );
  // Número herói do tile (o card inteiro é o clique principal — sem botão aqui).
  const hero = (value: string, sub: ReactNode, accent: string) => (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className={`font-display text-3xl font-extrabold tabular-nums ${accentText[accent]}`}>{value}</span>
      {sub && <span className="text-[11px] text-psa-ink-soft">{sub}</span>}
    </div>
  );
  // Linha de apoio label : valor. Se clicável, abre a lista específica (não o
  // card) via stopPropagation.
  const row = (label: string, value: string, onClick?: () => void) => (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-psa-ink-soft">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="font-semibold tabular-nums text-psa-ink cursor-pointer hover:text-psa-orange hover:underline underline-offset-2"
          title="Ver lista"
        >
          {value}
        </button>
      ) : (
        <span className="font-semibold tabular-nums text-psa-ink">{value}</span>
      )}
    </div>
  );
  const origens = [
    { label: "Carteira", count: f.demandasCarteira, cls: "bg-psa-blue" },
    { label: "Ação de CRM", count: f.demandasAcaoCrm, cls: "bg-psa-orange" },
    { label: "Ação de CRM (Carteira)", count: f.demandasAcaoCrmCarteira, cls: "bg-cyan-500" },
    { label: "Indicação", count: f.demandasIndicacao, cls: "bg-emerald-500" },
    { label: "Palestrante", count: f.demandasPalestrante, cls: "bg-violet-500" },
    { label: "Qualif. Farmer", count: f.demandasQualifFarmer, cls: "bg-psa-muted" },
  ];
  return (
    <div className="space-y-3">
    {stages.length > 0 && (
      <div className="rounded-lg border border-psa-line bg-psa-surface p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {head("Negócios por etapa (demandas)", "orange")}
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
    {/* Perfil completo do tomador de decisão (carteira) — medidor radial */}
    {(() => {
      const c = carteiraByOwner?.[f.ownerId];
      const total = c?.carteira ?? 0;
      const comp = c?.completo ?? 0;
      const pct = total > 0 ? (comp / total) * 100 : 0;
      const loading = carteiraByOwner == null;
      const faltam = Math.max(0, total - comp);
      // Anel: r=32, circunferência ≈ 201; offset preenche a fração do %.
      const R = 32;
      const CIRC = 2 * Math.PI * R;
      const gid = `carteiraGrad-${f.ownerId}`;
      return (
        <div className="rounded-xl border-2 border-psa-blue/40 bg-gradient-to-br from-psa-blue/[0.08] via-psa-blue/[0.03] to-transparent p-4 flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: 92, height: 92 }}>
            <svg width={92} height={92} viewBox="0 0 92 92" className="-rotate-90">
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <circle cx={46} cy={46} r={R} fill="none" stroke="currentColor" strokeWidth={9} className="text-psa-canvas" />
              <circle
                cx={46}
                cy={46}
                r={R}
                fill="none"
                stroke={`url(#${gid})`}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={loading ? CIRC : CIRC * (1 - Math.min(1, pct / 100))}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-extrabold text-psa-ink tabular-nums leading-none">
                {loading || total === 0 ? "…" : `${Math.round(pct)}%`}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-wide text-psa-ink-soft mt-0.5">completo</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-blue">
              Perfil completo · tomador de decisão (carteira)
            </div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="font-display text-2xl font-extrabold text-psa-ink tabular-nums">
                {loading ? "…" : num(comp)}
              </span>
              <span className="text-sm text-psa-ink-soft">de {loading ? "…" : num(total)} empresas com perfil completo</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
              <button
                type="button"
                onClick={loading || comp === 0 ? undefined : () => openCarteira("completos")}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-psa-blue/10 text-psa-blue font-semibold enabled:cursor-pointer enabled:hover:bg-psa-blue/20 transition-colors"
                disabled={loading || comp === 0}
                title="Ver empresas com perfil completo"
              >
                <span className="w-2 h-2 rounded-full bg-gradient-to-br from-sky-400 to-blue-600" />
                {loading ? "…" : num(comp)} completos
              </button>
              <button
                type="button"
                onClick={loading || faltam === 0 ? undefined : () => openCarteira("pendentes")}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-psa-canvas text-psa-ink-soft enabled:cursor-pointer enabled:hover:bg-psa-line/40 transition-colors"
                disabled={loading || faltam === 0}
                title="Ver empresas com perfil pendente (e o que falta)"
              >
                <span className="w-2 h-2 rounded-full bg-psa-line" />
                {loading ? "…" : num(faltam)} a completar
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Demandas levantadas — card inteiro abre a lista de demandas */}
      <div {...cardProps(onOpen && f.demandas > 0 ? () => onOpen("demandas") : undefined)} title="Ver demandas levantadas">
        {head("Demandas levantadas", "blue")}
        {hero(
          num(f.demandas),
          onOpen && empresasUnicas > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen("empresas_unicas"); }}
              className="cursor-pointer hover:text-psa-orange hover:underline underline-offset-2"
              title="Ver empresas únicas"
            >
              {num(empresasUnicas)} empresas únicas
            </button>
          ) : (
            <>{num(empresasUnicas)} empresas únicas</>
          ),
          "blue"
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {origens.filter((o) => o.count > 0).length === 0 ? (
            <span className="text-[11px] text-psa-ink-soft">Sem demandas no período</span>
          ) : (
            origens
              .filter((o) => o.count > 0)
              .map((o) => (
                <span key={o.label} className="inline-flex items-center gap-1 text-[11px] text-psa-ink-soft">
                  <span className={`w-2 h-2 rounded-sm ${o.cls}`} />
                  {o.label} <b className="text-psa-ink tabular-nums">{num(o.count)}</b>
                </span>
              ))
          )}
        </div>
        <div className="mt-auto pt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpen && f.emAberto > 0 ? (e) => { e.stopPropagation(); onOpen("aberto"); } : undefined}
            disabled={!onOpen || f.emAberto === 0}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-psa-canvas text-[11px] text-psa-ink-soft enabled:cursor-pointer enabled:hover:bg-psa-line/40 transition-colors"
            title="Ver negócios em aberto"
          >
            Em aberto <b className="text-psa-ink tabular-nums">{num(f.emAberto)}</b>
          </button>
          {foraMoaTotal > 0 && (
            <button
              type="button"
              onClick={onOpen ? (e) => { e.stopPropagation(); onOpen("fora_moa"); } : undefined}
              disabled={!onOpen}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-[11px] text-red-600 enabled:cursor-pointer enabled:hover:bg-red-100 transition-colors"
              title="Ver negócios Fora do MOA"
            >
              Fora do MOA <b className="tabular-nums">{num(foraMoaTotal)}</b>
            </button>
          )}
        </div>
      </div>

      {/* Negócios fechados — card inteiro abre os ganhos */}
      <div {...cardProps(onOpen && f.negocios > 0 ? () => onOpen("negocios") : undefined)} title="Ver negócios fechados (ganhos)">
        {head("Negócios fechados", "orange")}
        {hero(num(f.negocios), "ganhos", "orange")}
        <div className="mt-auto pt-3 space-y-0.5">
          {row("Receita", brl(f.receita), onOpen && f.negocios > 0 ? () => onOpen("receita") : undefined)}
          {row("Perdidos", num(f.perdidos), onOpen && f.perdidos > 0 ? () => onOpen("perdidos") : undefined)}
        </div>
      </div>

      {/* Tramitações — card inteiro abre as em andamento */}
      <div {...cardProps(onOpen && f.tramitacoes > 0 ? () => onOpen("tramitacoes") : undefined)} title="Ver tramitações em andamento">
        {head("Tramitações", "slate")}
        {hero(num(f.tramitacoes), "em andamento", "slate")}
        <div className="mt-auto pt-3">
          {row("Criadas no mês", num(f.tramitacoesCriadas), onOpen && f.tramitacoesCriadas > 0 ? () => onOpen("tramitacoes_criadas") : undefined)}
        </div>
      </div>

      {/* Reuniões — card inteiro abre as realizadas */}
      <div {...cardProps(onOpen && f.reunioesRealizadas > 0 ? () => onOpen("reunioes_realizadas") : undefined)} title="Ver reuniões realizadas">
        {head("Reuniões", "cyan")}
        {hero(num(f.reunioesRealizadas), "realizadas", "cyan")}
        <div className="mt-auto pt-3">
          {row("Agendadas", num(f.reunioesAgendadas), onOpen && f.reunioesAgendadas > 0 ? () => onOpen("reunioes_agendadas") : undefined)}
        </div>
      </div>
    </div>
    <CarteiraModal
      open={carteiraModal !== null}
      onClose={() => setCarteiraModal(null)}
      scopeLabel={f.nome}
      filter={carteiraModal ?? "pendentes"}
      companies={carteiraDetalhe}
    />
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

export default function FarmerTable({ rows, loading = false, csAtivo = true, onDrillDown, stageOrder = [], carteiraByOwner }: Props) {
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
      } else if (sort.key === "demandas") {
        cmp = empresasUnicasDe(a) - empresasUnicasDe(b); // coluna mostra empresas únicas
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
            <Th label="Empresas únicas" col="demandas" />
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
                  count={empresasUnicasDe(f)}
                  display={num(empresasUnicasDe(f))}
                  color="text-psa-blue"
                  onClick={onDrillDown ? () => onDrillDown(f, "empresas_unicas") : undefined}
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
                    carteiraByOwner={carteiraByOwner}
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
