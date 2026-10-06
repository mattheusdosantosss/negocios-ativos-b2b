"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Deal, ExcludedDeal, FetchValidation } from "@/lib/farmer2/hubspot";
import {
  computeSummaryStats, computeFarmerRanking, computeScoreDistribution, computeCriteriaAnalysis,
  computeMeetingConversion, computeForaDoMOA, filterDealsByPeriod, filterDealsByTeam,
  periodToMonthKey, PERIOD_OPTIONS, type PeriodKey,
} from "@/lib/farmer2/analytics";
import { TEAMS, monthlyGoal, uniqueDemandKey, MAX_SCORE } from "@/lib/farmer2/constants";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${Math.round(n)}%`;
const dec = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

type ApiData = {
  deals: Deal[];
  validation: FetchValidation;
  excludedDeals: ExcludedDeal[];
  farmerRevenue: Record<string, number>;
};

const TEAM_OPTIONS: { id: string | null; label: string }[] = [
  { id: null, label: "Todos os Farmers" },
  ...Object.entries(TEAMS).map(([id, t]) => ({ id, label: t.label })),
];

export default function FarmerV2Dashboard({ segmentSelector }: { segmentSelector?: ReactNode }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("");
  const [team, setTeam] = useState<string | null>(null);

  const load = (fresh = false) => {
    setLoading(true); setErr(null);
    fetch(`/api/farmer2${fresh ? "?t=" + Date.now() : ""}`, fresh ? { cache: "no-store" } : {})
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || "erro"))))
      .then((j) => { setData(j); setLoading(false); })
      .catch((e) => { setErr(String(e)); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const deals = data?.deals ?? [];
  // período + time (sensível à data, igual ao externo)
  const filtered = useMemo(() => filterDealsByPeriod(filterDealsByTeam(deals, team), period), [deals, team, period]);
  const stats = useMemo(() => computeSummaryStats(filtered), [filtered]);
  const ranking = useMemo(() => computeFarmerRanking(filtered), [filtered]);
  const conversion = useMemo(() => computeMeetingConversion(filtered), [filtered]);
  const dist = useMemo(() => computeScoreDistribution(filtered), [filtered]);
  const criteria = useMemo(() => computeCriteriaAnalysis(filtered), [filtered]);
  const monthKey = useMemo(() => periodToMonthKey(period) ?? new Date().toISOString().slice(0, 7), [period]);
  const foraDoMOA = useMemo(() => computeForaDoMOA(data?.excludedDeals ?? [], team, periodToMonthKey(period)), [data, team, period]);

  // Meta de empresas únicas do mês de referência (por time, quando selecionado).
  const meta = monthlyGoal(monthKey, team);
  const empresasNoMes = useMemo(() => {
    const mes = filterDealsByTeam(deals, team).filter((d) => d.date && d.date.slice(0, 7) === monthKey);
    return new Set(mes.map((d) => uniqueDemandKey(d))).size;
  }, [deals, team, monthKey]);

  // conversão por farmer indexada pra juntar no ranking
  const convById = useMemo(() => new Map(conversion.map((c) => [c.farmerId, c])), [conversion]);

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]" />
        <div className="relative px-8 py-7">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-psa-orange/15 border border-psa-orange/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-psa-orange">
                <span className="w-1.5 h-1.5 rounded-full bg-psa-orange" /> PSA · Farmers
              </div>
              <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight">
                Farmers<br /><span className="text-psa-orange">Dashboard de Qualificação.</span>
              </h1>
              <p className="mt-3 text-sm text-white/70 max-w-xl">
                Qualidade da qualificação por farmer (leadscore), empresas únicas, reuniões e metas. Metrificação por data de qualificação.
              </p>
            </div>
            <div className="flex flex-col w-full gap-2.5 sm:flex-row sm:items-start sm:w-auto sm:shrink-0">
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3 flex flex-col w-full gap-3 sm:flex-row sm:items-end sm:w-auto sm:flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/50">Time</span>
                  <select value={team ?? ""} onChange={(e) => setTeam(e.target.value || null)} className="rounded-lg border border-white/15 bg-psa-ink px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-psa-orange">
                    {TEAM_OPTIONS.map((t) => <option key={t.id ?? "all"} value={t.id ?? ""}>{t.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/50">Período</span>
                  <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="rounded-lg border border-white/15 bg-psa-ink px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-psa-orange">
                    {PERIOD_OPTIONS.filter((p) => p.value !== "entre").map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-1 w-full sm:w-[200px] rounded-xl bg-white/[0.06] border border-white/10 p-1">
                {segmentSelector}
                <button type="button" onClick={() => load(true)} disabled={loading} className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-white/[0.05] text-[13px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-60">
                  {loading ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Erro ao carregar: {err}</div>}
      {loading && !data && <div className="py-16 text-center text-sm text-psa-ink-soft">Carregando dados dos farmers…</div>}

      {data && (
        <>
          {/* Meta do mês (empresas únicas) */}
          <div className="rounded-2xl border-2 border-psa-orange/40 bg-gradient-to-br from-psa-orange/[0.07] to-transparent p-5">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-psa-orange">Meta do mês · empresas únicas{team ? " · " + TEAM_OPTIONS.find((t) => t.id === team)?.label : ""}</div>
                <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="font-display text-3xl font-extrabold text-psa-ink tabular-nums">{num(empresasNoMes)}</span>
                  <span className="text-sm text-psa-ink-soft">de <b className="text-psa-ink">{num(meta)}</b> · {monthKey}</span>
                </div>
              </div>
              <div className="font-display text-3xl font-extrabold text-psa-orange tabular-nums">{meta > 0 ? pct((empresasNoMes / meta) * 100) : "—"}</div>
            </div>
            <div className="mt-3 h-3 rounded-full bg-psa-canvas overflow-hidden">
              <div className="h-full rounded-full bg-psa-orange transition-all" style={{ width: `${meta > 0 ? Math.min(100, (empresasNoMes / meta) * 100) : 0}%` }} />
            </div>
          </div>

          {/* KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Kpi label="Empresas únicas" value={num(stats.totalCompanies)} hint="conta para a meta" accent />
            <Kpi label="Média de pontuação" value={`${dec(stats.avgScore, 1)} / ${MAX_SCORE}`} hint="qualidade da qualificação" />
            <Kpi label="Negócios" value={num(stats.totalDeals)} hint="inclui repetidos" />
            <Kpi label="Farmers ativos" value={num(stats.activeFarmers)} hint="≥ 1 negócio" />
            <Kpi label="Reuniões agendadas" value={pct(stats.totalCompanies ? (stats.meetingScheduled / stats.totalCompanies) * 100 : 0)} hint={`${num(stats.meetingScheduled)} de ${num(stats.totalCompanies)}`} />
            <Kpi label="Reuniões realizadas" value={pct(stats.totalCompanies ? (stats.meetingCompleted / stats.totalCompanies) * 100 : 0)} hint={`${num(stats.meetingCompleted)} de ${num(stats.totalCompanies)}`} />
            <Kpi label="No show" value={pct(stats.meetingScheduled ? (stats.meetingNoShow / stats.meetingScheduled) * 100 : 0)} hint={`${num(stats.meetingNoShow)} de ${num(stats.meetingScheduled)} agendadas`} />
          </section>

          {/* Ranking de farmers por score */}
          <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Ranking de farmers · por pontuação média</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[9px] font-bold uppercase tracking-wide text-psa-muted border-b border-psa-line">
                    <th className="text-left py-1.5 pr-2">#</th>
                    <th className="text-left py-1.5 pr-2">Farmer</th>
                    <th className="text-right py-1.5 px-2">Score médio</th>
                    <th className="text-right py-1.5 px-2">Empresas</th>
                    <th className="text-right py-1.5 px-2">Negócios</th>
                    <th className="text-right py-1.5 px-2 hidden sm:table-cell">Agend.</th>
                    <th className="text-right py-1.5 pl-2 hidden sm:table-cell">Realiz.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-psa-line/60">
                  {ranking.map((f, i) => {
                    const c = convById.get(f.farmerId);
                    return (
                      <tr key={f.farmerId}>
                        <td className="py-1.5 pr-2 text-psa-muted tabular-nums">{i + 1}</td>
                        <td className="py-1.5 pr-2 text-psa-ink truncate max-w-[180px]" title={f.farmerName}>{f.farmerName}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-psa-ink">{dec(f.avgScore, 1)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(f.companyCount)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(f.dealCount)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft hidden sm:table-cell">{c ? `${c.scheduledPct}%` : "—"}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums text-psa-ink-soft hidden sm:table-cell">{c ? `${c.completedPct}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição de score */}
            <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Distribuição de pontuação</div>
              <div className="mt-4 space-y-2">
                {(() => {
                  const max = Math.max(1, ...dist.map((d) => d.count));
                  return dist.map((d) => (
                    <div key={d.score} className="flex items-center gap-2">
                      <span className="w-6 text-right text-[11px] tabular-nums text-psa-ink-soft">{d.score}</span>
                      <div className="flex-1 h-5 rounded bg-psa-canvas overflow-hidden">
                        <div className="h-full rounded bg-psa-orange/80 flex items-center justify-end pr-1.5 text-[10px] font-semibold text-white" style={{ width: `${(d.count / max) * 100}%` }}>
                          {d.count > 0 && (d.count / max) > 0.12 ? num(d.count) : ""}
                        </div>
                      </div>
                      <span className="w-10 text-right text-[11px] tabular-nums text-psa-muted">{num(d.count)}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Análise de critérios */}
            <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Critérios que mais faltam · pontos perdidos</div>
              <div className="mt-3 divide-y divide-psa-line/60">
                {criteria.absence.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                    <span className="text-psa-ink truncate">{c.label} <span className="text-psa-muted">(peso {c.weight})</span></span>
                    <span className="shrink-0 tabular-nums text-psa-ink-soft">
                      <b className="text-red-600">{num(c.pointsLost)}</b> pts · {pct(c.absentPercent)} sem
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fora do MOA */}
          {foraDoMOA.length > 0 && (
            <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Fora do MOA · por farmer</div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {foraDoMOA.map((f) => (
                  <span key={f.farmerName} className="text-[12px] text-psa-ink-soft tabular-nums">
                    {f.farmerName} <b className="text-psa-ink">{num(f.count)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-psa-surface border border-psa-line p-3.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-psa-ink-soft leading-tight">{label}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${accent ? "text-psa-orange" : "text-psa-ink"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-psa-muted">{hint}</div>}
    </div>
  );
}
