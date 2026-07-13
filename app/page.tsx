"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import StageFunnel from "@/components/StageFunnel";
import CloserTable from "@/components/CloserTable";
import DealListModal from "@/components/DealListModal";
import PeriodFilter from "@/components/PeriodFilter";
import {
  AGING_BUCKETS,
  ACTIVITY_BUCKETS,
  allDealsOf,
  dealsForStage,
  dealsForEventBucket,
  dealsOutsideTeam,
  eventoDealsOf,
  type CloserRow,
  type DashboardData,
} from "@/lib/aggregate";
import { B2B_TEAM_IDS } from "@/lib/team";
import { computePeriod, type PeriodValue } from "@/lib/periods";

const EVENTO_BUCKET_LABELS: Record<"atrasado" | "proximo30" | "total", string> = {
  atrasado: "Evento com data atrasada",
  proximo30: "Evento nos próximos 30 dias",
  total: "Evento atrasado ou nos próximos 30 dias",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  type ModalState =
    | { mode: "single"; row: CloserRow; stageId: string | "total" }
    | { mode: "aggregated"; stageId: string }
    | { mode: "aging"; row: CloserRow; bucketId: string }
    | { mode: "activity"; row: CloserRow; bucketId: string }
    | { mode: "evento-agg"; bucket: "atrasado" | "proximo30" | "total" }
    | { mode: "evento-closer"; row: CloserRow }
    | { mode: "outside-team" }
    | null;
  const [modal, setModal] = useState<ModalState>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("all"));

  const handlePeriodChange = (next: PeriodValue) => {
    if (next.preset !== period.preset && next.preset !== "custom") {
      setPeriod(computePeriod(next.preset));
    } else {
      setPeriod(next);
    }
  };

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    if (period.from) qs.set("from", period.from);
    if (period.to) qs.set("to", period.to);
    return qs.toString();
  }, [period.from, period.to]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard${queryString ? `?${queryString}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro desconhecido");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filteredClosers = useMemo(() => {
    if (!data) return [];
    const q = normalize(search.trim());
    if (!q) return data.closers;
    return data.closers.filter((c) => normalize(c.nome).includes(q));
  }, [data, search]);

  const updatedAtFormatted = useMemo(() => {
    if (!data?.meta.updatedAt) return null;
    return new Date(data.meta.updatedAt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [data?.meta.updatedAt]);

  const ticketMedio = data && data.totals.total > 0 ? data.totals.valor / data.totals.total : 0;

  const modalDeals = useMemo(() => {
    if (!modal || !data) return [];
    if (modal.mode === "aggregated") return dealsForStage(data.closers, modal.stageId);
    if (modal.mode === "aging") return modal.row.dealsPorFaixa[modal.bucketId] ?? [];
    if (modal.mode === "activity") return modal.row.dealsPorAtividade[modal.bucketId] ?? [];
    if (modal.mode === "evento-agg") return dealsForEventBucket(data.closers, modal.bucket);
    if (modal.mode === "evento-closer") return eventoDealsOf(modal.row);
    if (modal.mode === "outside-team") return dealsOutsideTeam(data.closers);
    return modal.stageId === "total" ? allDealsOf(modal.row) : modal.row.dealsPorEtapa[modal.stageId] ?? [];
  }, [modal, data]);

  const modalStageLabel = useMemo(() => {
    if (!modal || !data) return "";
    if (modal.mode === "aging") return AGING_BUCKETS.find((b) => b.id === modal.bucketId)?.label ?? "";
    if (modal.mode === "activity") return ACTIVITY_BUCKETS.find((b) => b.id === modal.bucketId)?.label ?? "";
    if (modal.mode === "evento-agg") return EVENTO_BUCKET_LABELS[modal.bucket];
    if (modal.mode === "evento-closer") return EVENTO_BUCKET_LABELS.total;
    if (modal.mode === "outside-team") return "Fora do time B2B";
    if (modal.mode === "single" && modal.stageId === "total") return "Todos os negócios ativos";
    return data.stages.find((s) => s.id === modal.stageId)?.label ?? "";
  }, [modal, data]);

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-12 w-[300px] h-[300px] rounded-full bg-psa-blue opacity-25"
        />
        <div aria-hidden className="pointer-events-none absolute top-0 right-0 h-full w-1.5 bg-psa-orange" />

        <div className="relative px-8 py-8">
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  PSA · Closers B2B
                </span>
              </div>
              <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-tight text-white">
                Negócios Ativos
                <br />
                <span className="text-psa-orange">Funil de Vendas B2B.</span>
              </h1>
              <p className="mt-4 text-sm text-white/85 max-w-md">
                Snapshot ao vivo dos negócios em aberto na pipeline B2B, por Closer.
                Filtre por Data de criação pra ver só os negócios abertos no período.
              </p>
            </div>

            <div className="flex flex-nowrap items-end gap-2.5 shrink-0">
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3">
                <PeriodFilter value={period} onChange={handlePeriodChange} />
              </div>

              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 min-w-[150px] px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-sm font-semibold text-white/90 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-60 disabled:cursor-wait"
                title="Rebuscar os dados no HubSpot agora"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={loading ? "animate-spin" : ""}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Erro */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-display font-semibold mb-1">Erro ao carregar</div>
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {/* Aviso de dados de exemplo (sem token configurado) */}
      {data && !data.meta.usingLiveData && !loading && (
        <div className="rounded-2xl border border-psa-blue/20 bg-psa-blue-soft p-4 text-sm text-psa-blue">
          Exibindo snapshot de exemplo (sem <code className="px-1 py-0.5 bg-white/50 rounded">HUBSPOT_TOKEN</code> configurado). Configure a env var pra ver dados ao vivo.
          {period.preset !== "all" && " O filtro de Data de criação não se aplica a esse snapshot fixo."}
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Negócios ativos"
          value={data ? num(data.totals.total) : 0}
          accent="orange"
          hint="Soma das 7 etapas ativas"
          loading={loading}
        />
        <KpiCard
          label="Valor total em aberto"
          value={data ? brl(data.totals.valor) : "R$ 0,00"}
          accent="blue"
          hint="Soma do valor dos negócios ativos"
          loading={loading}
        />
        <KpiCard
          label="Closers com negócios ativos"
          value={data ? num(data.closers.filter((c) => B2B_TEAM_IDS.has(c.ownerId)).length) : 0}
          accent="ink"
          hint="Do time B2B, com ao menos 1 negócio ativo"
          loading={loading}
        />
        <KpiCard
          label="Ticket médio"
          value={data ? brl(ticketMedio) : "R$ 0,00"}
          accent="ink"
          hint="Valor total ÷ negócios ativos"
          loading={loading}
        />
      </section>

      {/* Atenção — fora do time B2B + Data Prevista do Evento */}
      <section className="rounded-2xl border-2 border-psa-ink/10 bg-psa-surface shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="text-lg leading-none">⚠️</span>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em] text-psa-ink">Atenção</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
          <button
            type="button"
            disabled={!data || data.totals.foraDoTimeB2B === 0}
            onClick={() => setModal({ mode: "outside-team" })}
            className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-ink/30 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
              Fora do time B2B
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">
              {data ? num(data.totals.foraDoTimeB2B) : 0}
            </div>
            <div className="mt-1 text-[11px] text-psa-ink-soft">Dono não é um dos 8 Closers do time</div>
          </button>

          <button
            type="button"
            disabled={!data || data.totals.eventoAtrasado === 0}
            onClick={() => setModal({ mode: "evento-agg", bucket: "atrasado" })}
            className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-ink/30 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
              Evento atrasado
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">
              {data ? num(data.totals.eventoAtrasado) : 0}
            </div>
            <div className="mt-1 text-[11px] text-psa-ink-soft">Data Prevista do Evento já passou</div>
          </button>

          <button
            type="button"
            disabled={!data || data.totals.eventoProximo30 === 0}
            onClick={() => setModal({ mode: "evento-agg", bucket: "proximo30" })}
            className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-ink/30 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
              Evento em até 30 dias
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">
              {data ? num(data.totals.eventoProximo30) : 0}
            </div>
            <div className="mt-1 text-[11px] text-psa-ink-soft">Data Prevista do Evento nos próximos 30 dias</div>
          </button>

          <button
            type="button"
            disabled={!data || data.totals.eventoAtrasado + data.totals.eventoProximo30 === 0}
            onClick={() => setModal({ mode: "evento-agg", bucket: "total" })}
            className="text-left rounded-xl border-2 border-psa-orange/40 bg-psa-orange-soft p-4 hover:border-psa-orange transition-all disabled:cursor-default"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-orange">
              Total (atrasado + 30 dias)
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">
              {data ? num(data.totals.eventoAtrasado + data.totals.eventoProximo30) : 0}
            </div>
            <div className="mt-1 text-[11px] text-psa-orange/80">Soma dos dois acima</div>
          </button>
        </div>
      </section>

      {/* Funil por etapa */}
      {data && (
        <StageFunnel
          stages={data.stages}
          porEtapa={data.totals.porEtapa}
          loading={loading}
          onOpenStage={(stageId) => setModal({ mode: "aggregated", stageId })}
        />
      )}

      {/* Tabela por closer */}
      <section>
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display text-lg font-semibold text-psa-ink">Detalhe por Closer</h2>
          {data && !loading && (
            <span className="text-xs text-psa-ink-soft">
              {filteredClosers.length}/{data.closers.length} closers
              {updatedAtFormatted && (
                <>
                  {" · "}
                  <span title="Última atualização dos dados">Atualizado {updatedAtFormatted}</span>
                </>
              )}
            </span>
          )}
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar closer…"
            className="w-full max-w-xs rounded-xl border border-psa-line bg-psa-surface px-4 py-2 text-sm shadow-card focus:outline-none focus:ring-2 focus:ring-psa-orange/40"
          />
        </div>

        <CloserTable
          rows={filteredClosers}
          stages={data?.stages ?? []}
          loading={loading}
          onOpenStage={(row, stageId) => setModal({ mode: "single", row, stageId })}
          onOpenAgingBucket={(row, bucketId) => setModal({ mode: "aging", row, bucketId })}
          onOpenActivityBucket={(row, bucketId) => setModal({ mode: "activity", row, bucketId })}
          onOpenEvento={(row) => setModal({ mode: "evento-closer", row })}
        />
      </section>

      <DealListModal
        open={modal !== null}
        onClose={() => setModal(null)}
        closerName={
          modal?.mode === "single" ||
          modal?.mode === "aging" ||
          modal?.mode === "activity" ||
          modal?.mode === "evento-closer"
            ? modal.row.nome
            : undefined
        }
        stageLabel={modalStageLabel}
        deals={modalDeals}
      />
    </main>
  );
}
