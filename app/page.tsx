"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import TemperatureStacked, { PERFIL_STYLE, TASK_STYLE } from "@/components/TemperatureStacked";
import CloserOpenDeals from "@/components/CloserOpenDeals";
import CloseTimeChart from "@/components/CloseTimeChart";
import MacroTemaConversion from "@/components/MacroTemaConversion";
import ConversionCard from "@/components/ConversionCard";
import PropostaMeetingCard from "@/components/PropostaMeetingCard";
import SectionCard from "@/components/SectionCard";
import DealListModal from "@/components/DealListModal";
import CloserSummaryModal from "@/components/CloserSummaryModal";
import PeriodFilter from "@/components/PeriodFilter";
import LeadSourceFilter from "@/components/LeadSourceFilter";
import CloserFilter from "@/components/CloserFilter";
import {
  AGING_BUCKETS,
  ACTIVITY_BUCKETS,
  EVENT_30D_BUCKETS,
  TEMPERATURES,
  PERFIS,
  TASK_CATEGORIES,
  allDealsOf,
  dealsForEventoAtrasado,
  dealsForEventoProximo30,
  dealsForecast,
  dealsForEvento30Temp,
  dealsForTemp,
  dealsForPerfil,
  dealsOutsideTeam,
  conviccaoGeral,
  type CloserRow,
  type DashboardData,
} from "@/lib/aggregate";
import { SEGMENTS, SEGMENT_TABS, type SegmentId } from "@/lib/segments";
import { computePeriod, type PeriodValue } from "@/lib/periods";
import { type LeadSourceId } from "@/lib/leadSource";

const EVENTO_ATRASADO_LABEL = "Evento que a data já passou";
const EVENTO_PROXIMO30_LABEL = "Evento nos próximos 30 dias";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

export default function Page() {
  const [segment, setSegment] = useState<SegmentId>("b2b");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type ModalState =
    | { mode: "single"; row: CloserRow; stageId: string | "total" }
    | { mode: "aging"; row: CloserRow; bucketId: string }
    | { mode: "activity"; row: CloserRow; bucketId: string }
    | { mode: "evento-atrasado-agg" }
    | { mode: "evento-proximo30-agg" }
    | { mode: "evento30-temp"; bucketId: string; tempId: string }
    | { mode: "evento-atrasado-closer"; row: CloserRow }
    | { mode: "outside-team" }
    | { mode: "forecast" }
    | { mode: "checkout"; stageId: string }
    | { mode: "close-time"; bucketId: string; outcomeId: string }
    | { mode: "temp-agg"; stageId: string; tempId: string }
    | { mode: "temp-closer"; row: CloserRow; stageId: string; tempId: string }
    | { mode: "perfil-agg"; stageId: string; perfilId: string }
    | { mode: "task-agg"; stageId: string; catId: string }
    | null;
  const [modal, setModal] = useState<ModalState>(null);
  const [showCloserSummary, setShowCloserSummary] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("all"));
  const [leadSource, setLeadSource] = useState<LeadSourceId>("all");
  const [closer, setCloser] = useState<string>("all"); // ownerId do roster ou "all"

  // Labels estáticos do segmento selecionado (o hero atualiza na hora, sem
  // esperar o fetch; os números vêm do payload).
  const cfg = SEGMENTS[segment];

  const handlePeriodChange = (next: PeriodValue) => {
    if (next.preset !== period.preset && next.preset !== "custom") {
      setPeriod(computePeriod(next.preset));
    } else {
      setPeriod(next);
    }
  };

  const handleSegmentChange = (next: SegmentId) => {
    if (next === segment) return;
    setSegment(next);
    setCloser("all"); // roster muda entre B2B/B2C — não carrega closer do outro
    setData(null); // evita piscar dados do segmento anterior
    setModal(null);
    setShowCloserSummary(false);
  };

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("segment", segment);
    if (period.from) qs.set("from", period.from);
    if (period.to) qs.set("to", period.to);
    if (leadSource !== "all") qs.set("origem", leadSource);
    if (closer !== "all") qs.set("owner", closer);
    return qs.toString();
  }, [segment, period.from, period.to, leadSource, closer]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?${queryString}`);
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

  // Closers do roster do segmento que têm ao menos 1 negócio ativo.
  const teamClosers = useMemo(
    () => (data ? data.closers.filter((c) => c.inTeam) : []),
    [data]
  );

  // Opções do filtro de Closer: só quem tem negócio ativo (os mesmos listados
  // no painel), em ordem alfabética.
  const closerOptions = useMemo(
    () =>
      teamClosers
        .map((c) => ({ ownerId: c.ownerId, nome: c.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [teamClosers]
  );

  // Ticket médio de ganho = valor dos negócios ganhos ÷ nº de ganhos.
  const ticketMedioGanho =
    data && data.totals.ganhoCount > 0 ? data.totals.ganhoValor / data.totals.ganhoCount : 0;

  const modalDeals = useMemo(() => {
    if (!modal || !data) return [];
    if (modal.mode === "aging") return modal.row.dealsPorFaixa[modal.bucketId] ?? [];
    if (modal.mode === "activity") return modal.row.dealsPorAtividade[modal.bucketId] ?? [];
    if (modal.mode === "evento-atrasado-agg") return dealsForEventoAtrasado(data.closers);
    if (modal.mode === "evento-proximo30-agg") return dealsForEventoProximo30(data.closers);
    if (modal.mode === "evento30-temp") return dealsForEvento30Temp(data.closers, modal.bucketId, modal.tempId);
    if (modal.mode === "evento-atrasado-closer") return modal.row.dealsEventoAtrasado;
    if (modal.mode === "outside-team") return dealsOutsideTeam(data.closers);
    if (modal.mode === "forecast") return dealsForecast(data.closers);
    if (modal.mode === "checkout") return data.checkout?.dealsPorEtapa[modal.stageId] ?? [];
    if (modal.mode === "close-time") return data.closeTime?.deals[modal.bucketId]?.[modal.outcomeId] ?? [];
    if (modal.mode === "temp-agg") return dealsForTemp(data.closers, modal.stageId, modal.tempId);
    if (modal.mode === "temp-closer") return modal.row.dealsTempPorEtapa[modal.stageId]?.[modal.tempId] ?? [];
    if (modal.mode === "perfil-agg") return dealsForPerfil(data.closers, modal.stageId, modal.perfilId);
    if (modal.mode === "task-agg") return data.tasks?.deals[modal.stageId]?.[modal.catId] ?? [];
    return modal.stageId === "total" ? allDealsOf(modal.row) : modal.row.dealsPorEtapa[modal.stageId] ?? [];
  }, [modal, data]);

  const modalStageLabel = useMemo(() => {
    if (!modal || !data) return "";
    if (modal.mode === "aging") return AGING_BUCKETS.find((b) => b.id === modal.bucketId)?.label ?? "";
    if (modal.mode === "activity") return ACTIVITY_BUCKETS.find((b) => b.id === modal.bucketId)?.label ?? "";
    if (modal.mode === "evento-atrasado-agg") return EVENTO_ATRASADO_LABEL;
    if (modal.mode === "evento-proximo30-agg") return EVENTO_PROXIMO30_LABEL;
    if (modal.mode === "evento30-temp") {
      const janela = EVENT_30D_BUCKETS.find((b) => b.id === modal.bucketId)?.label ?? "";
      const temp = TEMPERATURES.find((t) => t.id === modal.tempId)?.label ?? "";
      return `${temp} · evento em ${janela}`;
    }
    if (modal.mode === "evento-atrasado-closer") return EVENTO_ATRASADO_LABEL;
    if (modal.mode === "outside-team") return `Fora do time ${cfg.label}`;
    if (modal.mode === "forecast") return "Forecast · negócios no forecast";
    if (modal.mode === "checkout") {
      return data.checkout?.stages.find((s) => s.id === modal.stageId)?.label ?? "Checkout";
    }
    if (modal.mode === "close-time") {
      const faixa = data.closeTime?.buckets.find((b) => b.id === modal.bucketId)?.label ?? "";
      const outcome = data.closeTime?.outcomes.find((o) => o.id === modal.outcomeId)?.label ?? "";
      return `${outcome} · fechou em ${faixa}`;
    }
    if (modal.mode === "temp-agg" || modal.mode === "temp-closer") {
      const etapa = data.tempStages.find((s) => s.id === modal.stageId)?.label ?? "";
      const temp = TEMPERATURES.find((t) => t.id === modal.tempId)?.label ?? "";
      return `${temp} · ${etapa}`;
    }
    if (modal.mode === "perfil-agg") {
      const etapa = data.tempStages.find((s) => s.id === modal.stageId)?.label ?? "";
      const perfil = PERFIS.find((p) => p.id === modal.perfilId)?.label ?? "";
      return `${perfil} · ${etapa}`;
    }
    if (modal.mode === "task-agg") {
      const etapa = data.tempStages.find((s) => s.id === modal.stageId)?.label ?? "";
      const cat = TASK_CATEGORIES.find((c) => c.id === modal.catId)?.label ?? "";
      return `${cat} · ${etapa}`;
    }
    if (modal.mode === "single" && modal.stageId === "total") return "Todos os negócios ativos";
    return data.stages.find((s) => s.id === modal.stageId)?.label ?? "";
  }, [modal, data, cfg.label]);

  // Cada tipo de popup mostra ao lado do valor a data mais relevante ao seu contexto.
  const modalDateField = useMemo((): "createdate" | "qualdate" | "activitydate" | "eventdate" | "meetingdate" | "closedate" => {
    if (!modal) return "createdate";
    if (modal.mode === "aging") return "qualdate";
    if (modal.mode === "activity" || modal.mode === "task-agg") return "activitydate";
    if (modal.mode === "close-time") return "closedate";
    if (
      modal.mode === "evento-atrasado-agg" ||
      modal.mode === "evento-proximo30-agg" ||
      modal.mode === "evento30-temp" ||
      modal.mode === "evento-atrasado-closer"
    )
      return "eventdate";
    return "createdate";
  }, [modal]);

  const conviccao = useMemo(() => (data ? conviccaoGeral(data.totals.tempPorEtapa) : null), [data]);

  // Cobertura de Perfil: total nas etapas de temperatura e % com perfil preenchido.
  const perfilCobertura = useMemo(() => {
    if (!data) return null;
    const m = data.totals.perfilPorEtapa;
    let total = 0;
    let semPerfil = 0;
    for (const sid of Object.keys(m)) {
      for (const p of PERFIS) total += m[sid]?.[p.id] ?? 0;
      semPerfil += m[sid]?.sem_perfil ?? 0;
    }
    const comPerfil = total - semPerfil;
    return { total, comPerfil, cobertura: total > 0 ? comPerfil / total : 0 };
  }, [data]);

  const forecast = useMemo(() => (data ? dealsForecast(data.closers) : []), [data]);
  const forecastValor = useMemo(() => forecast.reduce((s, d) => s + d.amount, 0), [forecast]);

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
                  {cfg.eyebrow}
                </span>
              </div>
              <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-tight text-white">
                Negócios Ativos
                <br />
                <span className="text-psa-orange">{cfg.pipelineName}.</span>
              </h1>
              <p className="mt-4 text-sm text-white/85 max-w-md">
                Snapshot ao vivo dos negócios em aberto na pipeline {cfg.label}, por Closer.
                Filtre por Data de criação pra ver só os negócios abertos no período.
              </p>
            </div>

            <div className="flex items-end gap-2.5 shrink-0">
              {/* Filtro de período */}
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3 flex items-end gap-3 flex-wrap">
                <PeriodFilter value={period} onChange={handlePeriodChange} />
                <LeadSourceFilter value={leadSource} onChange={setLeadSource} />
                <CloserFilter value={closer} options={closerOptions} onChange={setCloser} />
              </div>

              {/* Coluna direita: abas B2B|B2C logo acima do Atualizar (mesma largura) */}
              <div className="flex flex-col gap-2.5">
                <div className="flex rounded-xl bg-white/[0.06] border border-white/10 p-1">
                  {SEGMENT_TABS.map((t) => {
                    const active = t.id === segment;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSegmentChange(t.id)}
                        aria-pressed={active}
                        className={`flex-1 text-center px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                          active
                            ? "bg-psa-orange text-white shadow"
                            : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
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
          hint={data ? `Soma das ${data.stages.length} etapas ativas` : "Soma das etapas ativas"}
          loading={loading}
        />
        <KpiCard
          label="Valor previsto (Forecast)"
          value={data ? brl(forecastValor) : "R$ 0,00"}
          accent="blue"
          hint={
            data && forecast.length > 0
              ? `${num(forecast.length)} negócios em Forecast · valor bruto · ver lista ↗`
              : "Negócios com temperatura Forecast (previsão firme) · valor bruto"
          }
          loading={loading}
          onClick={data && forecast.length > 0 ? () => setModal({ mode: "forecast" }) : undefined}
        />
        <KpiCard
          label="Closers com negócios ativos"
          value={data ? num(teamClosers.length) : 0}
          accent="ink"
          hint={`Do time ${cfg.label}, com ao menos 1 negócio ativo · ver lista ↗`}
          loading={loading}
          onClick={data && teamClosers.length > 0 ? () => setShowCloserSummary(true) : undefined}
        />
        <KpiCard
          label="Ticket médio de ganho"
          value={data ? brl(ticketMedioGanho) : "R$ 0,00"}
          accent="ink"
          hint={
            data
              ? `${num(data.totals.ganhoCount)} ganhos (todo o histórico) · valor bruto`
              : "Valor dos ganhos ÷ nº de ganhos"
          }
          loading={loading}
        />
      </section>

      {/* Taxa de conversão Proposta → Ganho — logo abaixo dos 4 KPIs principais */}
      {data && data.conversion && data.conversion.geral.entered > 0 && (
        <ConversionCard data={data.conversion} />
      )}

      {/* Proposta enviada → reunião (B2B) */}
      {data && data.propostaMeeting && data.propostaMeeting.total > 0 && (
        <SectionCard
          title="Proposta enviada → reunião"
          subtitle="dos negócios com proposta anexada, quantos tiveram reunião"
        >
          <PropostaMeetingCard data={data.propostaMeeting} />
        </SectionCard>
      )}

      {/* Checkout — só nos segmentos com fase de pagamento (ex.: B2C) */}
      {data && data.checkout && data.checkout.stages.length > 0 && (
        <section className="rounded-2xl border border-psa-line bg-psa-surface shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 flex-wrap">
            <span className="text-lg leading-none">💳</span>
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em] text-psa-ink">Checkout</h2>
            <span className="text-[11px] text-psa-ink-soft">Fase de pagamento · fora do total de ativos</span>
          </div>
          <div className={`grid grid-cols-1 gap-4 p-5 ${data.checkout.stages.length > 1 ? "md:grid-cols-2" : ""}`}>
            {data.checkout.stages.map((s) => {
              const count = data.checkout!.porEtapa[s.id] ?? 0;
              const valor = data.checkout!.valorPorEtapa[s.id] ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setModal({ mode: "checkout", stageId: s.id })}
                  className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-orange/40 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
                    {s.label}
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">{num(count)}</div>
                  <div className="mt-1 text-[11px] text-psa-ink-soft">
                    {brl(valor)} · valor bruto{count > 0 ? " · ver lista ↗" : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Atenção — fora do time + Data Prevista do Evento */}
      <section className="rounded-2xl border-2 border-psa-ink/10 bg-psa-surface shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4">
          <span className="text-lg leading-none">⚠️</span>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.1em] text-psa-ink">Atenção</h2>
        </div>
        <div className={`grid grid-cols-1 gap-4 p-5 ${cfg.hasEvento ? "md:grid-cols-2" : ""}`}>
          <button
            type="button"
            disabled={!data || data.totals.foraDoTime === 0}
            onClick={() => setModal({ mode: "outside-team" })}
            className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-ink/30 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
              Fora do time {cfg.label}
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">
              {data ? num(data.totals.foraDoTime) : 0}
            </div>
            <div className="mt-1 text-[11px] text-psa-ink-soft">Dono não é um dos Closers do time</div>
          </button>

          {cfg.hasEvento && (
            <button
              type="button"
              disabled={!data || data.totals.eventoAtrasado === 0}
              onClick={() => setModal({ mode: "evento-atrasado-agg" })}
              className="text-left rounded-xl border border-psa-line p-4 hover:border-psa-ink/30 hover:bg-psa-canvas/40 transition-all disabled:cursor-default disabled:hover:border-psa-line disabled:hover:bg-transparent"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
                {EVENTO_ATRASADO_LABEL}
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums">
                {data ? num(data.totals.eventoAtrasado) : 0}
              </div>
              <div className="mt-1 text-[11px] text-psa-ink-soft">Data Prevista do Evento já passou</div>
            </button>
          )}
        </div>

        {/* Evento em até 30 dias — número + distribuição dos eventos futuros */}
        {cfg.hasEvento && (
          <div className="px-5 pb-5">
            <div className="rounded-xl border border-psa-line p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
                    Evento em até 30 dias
                  </div>
                  <button
                    type="button"
                    disabled={!data || data.totals.eventoProximo30 === 0}
                    onClick={() => setModal({ mode: "evento-proximo30-agg" })}
                    className="mt-1 font-display text-2xl font-bold text-psa-ink tabular-nums hover:underline underline-offset-2 decoration-2 decoration-psa-orange/60 disabled:hover:no-underline"
                  >
                    {data ? num(data.totals.eventoProximo30) : 0}
                  </button>
                  <div className="mt-1 text-[11px] text-psa-ink-soft">
                    Data Prevista do Evento nos próximos 30 dias · por temperatura
                  </div>
                </div>
              </div>
              {data && (
                <TemperatureStacked
                  stages={EVENT_30D_BUCKETS}
                  matrix={data.totals.eventoProx30PorTemp}
                  onOpen={(bucketId, tempId) => setModal({ mode: "evento30-temp", bucketId, tempId })}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Negócios ativos por temperatura (leitura do curador) */}
      {data && conviccao && (
        <SectionCard
          title="Negócios ativos por temperatura"
          subtitle={
            <>
              convicção{" "}
              <b className="text-psa-ink">
                {(conviccao.conviccao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </b>{" "}
              · cobertura{" "}
              <b className="text-psa-ink">
                {(conviccao.cobertura * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </b>{" "}
              · {data.tempStages.length} etapas
            </>
          }
        >
          <TemperatureStacked
            stages={data.tempStages}
            matrix={data.totals.tempPorEtapa}
            onOpen={(stageId, tempId) => setModal({ mode: "temp-agg", stageId, tempId })}
          />
        </SectionCard>
      )}

      {/* Tarefas por etapa do funil — situação da próxima tarefa aberta dos
          negócios ativos (mesmo componente de barras da temperatura). */}
      {data && data.tasks && data.tasks.total > 0 && (
        <SectionCard
          title="Tarefas por etapa do funil"
          subtitle={
            <>
              {num(data.tasks.total)} ativos ·{" "}
              <b className="text-psa-ink">{num(data.tasks.totals.atrasada)}</b> com tarefa atrasada ·{" "}
              <b className="text-psa-ink">{num(data.tasks.totals.sem_tarefa)}</b> sem tarefa
            </>
          }
        >
          <TemperatureStacked
            stages={data.tasks.stages}
            matrix={data.tasks.matrix}
            categories={TASK_CATEGORIES}
            styleMap={TASK_STYLE}
            rightStat={(stageId) => {
              const r = data.tasks!.matrix[stageId] ?? {};
              return (
                <>
                  <b className="text-psa-ink">{num(r.atrasada ?? 0)}</b> atrasada{(r.atrasada ?? 0) === 1 ? "" : "s"} ·{" "}
                  <b className="text-psa-ink">{num(r.sem_tarefa ?? 0)}</b> sem tarefa
                </>
              );
            }}
            onOpen={(stageId, catId) => setModal({ mode: "task-agg", stageId, catId })}
          />
        </SectionCard>
      )}

      {/* Negócios ativos por perfil (mesma lógica da temperatura, dimensão Perfil).
          Só aparece quando há perfil preenchido (B2C) — no B2B a propriedade é vazia. */}
      {data && perfilCobertura && perfilCobertura.comPerfil > 0 && (
        <SectionCard
          title="Negócios ativos por perfil"
          subtitle={
            <>
              cobertura{" "}
              <b className="text-psa-ink">
                {(perfilCobertura.cobertura * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </b>{" "}
              · {num(perfilCobertura.comPerfil)} com perfil · {data.tempStages.length} etapas
            </>
          }
        >
          <TemperatureStacked
            stages={data.tempStages}
            matrix={data.totals.perfilPorEtapa}
            categories={PERFIS}
            styleMap={PERFIL_STYLE}
            showConviccao={false}
            onOpen={(stageId, perfilId) => setModal({ mode: "perfil-agg", stageId, perfilId })}
          />
        </SectionCard>
      )}

      {/* Tempo da reunião ao fechamento — dias da 1ª reunião concluída com o
          closer até o negócio virar Ganho/Perdido (só negócios dos closers). */}
      {data && data.closeTime && (
        <SectionCard
          title="Tempo da reunião ao fechamento"
          subtitle={
            <>
              {num(data.closeTime.total)} negócios fechados dos closers · mediana{" "}
              <b className="text-psa-ink">{num(data.closeTime.medianDays.all)}d</b> (ganho{" "}
              {num(data.closeTime.medianDays.won)}d · perdido {num(data.closeTime.medianDays.lost)}d)
            </>
          }
        >
          <CloseTimeChart
            data={data.closeTime}
            onOpen={(bucketId, outcomeId) => setModal({ mode: "close-time", bucketId, outcomeId })}
          />
        </SectionCard>
      )}

      {/* Conversão por macro tema (B2B) — win rate Ganho ÷ fechados, por macro
          tema, sobre os fechados dos closers. Respeita o filtro de Closer do
          topo (Todos = time; um closer = só ele). */}
      {data && data.macroTema && data.macroTema.rows.length > 0 && (
        <SectionCard
          title="Conversão por macro tema"
          subtitle={
            <>
              {num(data.macroTema.total)} negócios com macro tema · conversão geral{" "}
              <b className="text-psa-ink">
                {(data.macroTema.conv * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </b>{" "}
              · {data.macroTema.rows.length} temas
            </>
          }
        >
          <MacroTemaConversion data={data.macroTema} />
        </SectionCard>
      )}

      {/* Negócios abertos por Closer — sempre por último (após os gráficos). */}
      {data && cfg.hasCloserBreakdown && (
        <SectionCard
          title="Negócios abertos por Closer"
          subtitle="clique no closer pra abrir a temperatura · no nº de ativos pra listar os negócios"
        >
          <CloserOpenDeals
            closers={data.closers}
            tempStages={data.tempStages}
            onOpenTemp={(row, stageId, tempId) => setModal({ mode: "temp-closer", row, stageId, tempId })}
            onOpenTotal={(row) => setModal({ mode: "single", row, stageId: "total" })}
          />
        </SectionCard>
      )}

      <DealListModal
        open={modal !== null}
        onClose={() => setModal(null)}
        closerName={
          modal?.mode === "single" ||
          modal?.mode === "aging" ||
          modal?.mode === "activity" ||
          modal?.mode === "evento-atrasado-closer" ||
          modal?.mode === "temp-closer"
            ? modal.row.nome
            : undefined
        }
        stageLabel={modalStageLabel}
        deals={modalDeals}
        dateField={modalDateField}
      />

      <CloserSummaryModal
        open={showCloserSummary}
        onClose={() => setShowCloserSummary(false)}
        rows={teamClosers}
        teamLabel={cfg.label}
      />
    </main>
  );
}
