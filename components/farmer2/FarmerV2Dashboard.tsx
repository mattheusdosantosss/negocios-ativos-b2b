"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Deal, ExcludedDeal, FetchValidation, WonDeal } from "@/lib/farmer2/hubspot";
import {
  computeSummaryStats, computeFarmerRanking, computeScoreDistribution, computeCriteriaAnalysis,
  computeMeetingConversion, computeForaDoMOA, computeOpportunitiesByDay, filterDealsByPeriod,
  filterDealsByTeam, periodToMonthKey, PERIOD_OPTIONS, type PeriodKey,
} from "@/lib/farmer2/analytics";
import { TEAMS, monthlyGoal, uniqueDemandKey, isB2CCloser, isDealWithCreator, MAX_SCORE } from "@/lib/farmer2/constants";
import { computeMacroKPIs, computeFarmerMatrix, generateInsights, computeStaleDeals } from "@/lib/farmer2/insights";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${Math.round(n)}%`;
const dec = (n: number, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brlK = (n: number) => (n >= 1e6 ? `R$ ${dec(n / 1e6, 1)}M` : `R$ ${Math.round(n / 1000).toLocaleString("pt-BR")}k`);
const fmtDM = (isoDay: string) => { const [, m, d] = isoDay.split("-"); return `${d}/${m}`; };
const monthLabelOf = (monthKey: string) => { const [y, m] = monthKey.split("-").map(Number); const n = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" }); return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`; };

type ApiData = {
  deals: Deal[];
  validation: FetchValidation;
  excludedDeals: ExcludedDeal[];
  wonDeals: WonDeal[];
};

type RankSortKey = "nome" | "score" | "empresas" | "negocios" | "agend" | "realiz" | "receita";
const RANK_SORT_LABEL: Record<RankSortKey, string> = {
  nome: "nome", score: "pontuação média", empresas: "empresas", negocios: "negócios",
  agend: "agendadas", realiz: "realizadas", receita: "receita",
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
  const [rankSort, setRankSort] = useState<{ key: RankSortKey; dir: "asc" | "desc" }>({ key: "empresas", dir: "desc" });
  const [pickedDay, setPickedDay] = useState<string | null>(null);

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
  const monthLabel = monthLabelOf(monthKey);
  const empresasNoMes = useMemo(() => {
    const mes = filterDealsByTeam(deals, team).filter((d) => d.date && d.date.slice(0, 7) === monthKey);
    return new Set(mes.map((d) => uniqueDemandKey(d))).size;
  }, [deals, team, monthKey]);

  // conversão por farmer indexada pra juntar no ranking
  const convById = useMemo(() => new Map(conversion.map((c) => [c.farmerId, c])), [conversion]);

  // Receita dos negócios ganhos (farmer = SDR/responsável), por data de fechamento
  // dentro do período/time selecionados.
  const revenueById = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of filterDealsByPeriod(filterDealsByTeam(data?.wonDeals ?? [], team), period)) {
      m.set(w.farmerId, (m.get(w.farmerId) ?? 0) + w.amount);
    }
    return m;
  }, [data, team, period]);

  // Ranking ordenável por qualquer coluna (padrão: empresas, maior primeiro).
  // Empate → score médio; sem dado de reunião vai pro fim.
  const sortedRanking = useMemo(() => {
    const val = (f: (typeof ranking)[number]): number | string => {
      const c = convById.get(f.farmerId);
      switch (rankSort.key) {
        case "nome": return f.farmerName.toLocaleLowerCase("pt-BR");
        case "score": return f.avgScore;
        case "empresas": return f.companyCount;
        case "negocios": return f.dealCount;
        case "agend": return c ? c.scheduledPct : -1;
        case "realiz": return c ? c.completedPct : -1;
        case "receita": return revenueById.get(f.farmerId) ?? 0;
      }
    };
    const sign = rankSort.dir === "asc" ? 1 : -1;
    return [...ranking].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string, "pt-BR") : va - (vb as number);
      return cmp !== 0 ? cmp * sign : b.avgScore - a.avgScore;
    });
  }, [ranking, convById, revenueById, rankSort]);

  const toggleRankSort = (key: RankSortKey) =>
    setRankSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "nome" ? "asc" : "desc" }));

  const rankTh = ({ k, label, className, title }: { k: RankSortKey; label: string; className: string; title?: string }) => {
    const active = rankSort.key === k;
    return (
      <th className={className} title={title} aria-sort={active ? (rankSort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => toggleRankSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-psa-ink transition-colors ${active ? "text-psa-orange" : ""}`}>
          {label}
          <span className={`text-[8px] leading-none ${active ? "" : "opacity-30"}`}>{active ? (rankSort.dir === "asc" ? "▲" : "▼") : "▼"}</span>
        </button>
      </th>
    );
  };

  // ── MTD: composição por origem (do mês de referência, time-filtrado) + pace ──
  const mtd = useMemo(() => {
    const teamDeals = filterDealsByTeam(deals, team);
    const monthDeals = teamDeals.filter((d) => d.date && d.date.slice(0, 7) === monthKey);
    const total = new Set(monthDeals.map((d) => uniqueDemandKey(d))).size;
    // Prioridade: Convertido B2C → Ação de CRM → Com Criador → Carteira (dedup por empresa única)
    const seen = new Set<string>();
    let b2c = 0, crm = 0, criador = 0, carteira = 0;
    for (const d of monthDeals) {
      const k = uniqueDemandKey(d);
      if (seen.has(k)) continue;
      seen.add(k);
      if (d.ownerName && isB2CCloser(d.ownerName)) b2c++;
      else if (d.origemDoLead === "Ação de CRM" || d.origemDoLead === "Ação de CRM (Carteira)") crm++;
      else if (isDealWithCreator(d.farmerId, d.ownerId)) criador++;
      else carteira++;
    }
    // Pace (meta do dia): dias úteis decorridos / dias úteis do mês × meta.
    const [y, m] = monthKey.split("-").map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCurrent = monthKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isPast = monthKey < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const bizDays = (from: number, to: number) => { let c = 0; for (let d = from; d <= to; d++) { const wd = new Date(y, m - 1, d).getDay(); if (wd !== 0 && wd !== 6) c++; } return c; };
    const bizTotal = bizDays(1, totalDays);
    const bizElapsed = isPast ? bizTotal : isCurrent ? bizDays(1, now.getDate()) : 0;
    const paceTarget = bizTotal > 0 ? Math.round((bizElapsed / bizTotal) * meta) : 0;
    const diff = total - paceTarget;
    // Críticos: criadores sem repasse há > 3 dias (só mês corrente).
    const THREE = 3 * 86_400_000;
    const nowMs = Date.now();
    const criticos = isCurrent ? monthDeals.filter((d) => isDealWithCreator(d.farmerId, d.ownerId) && d.date && nowMs - new Date(d.date).getTime() > THREE).length : 0;
    return { total, b2c, crm, criador, carteira, paceTarget, diff, criticos, isCurrent };
  }, [deals, team, monthKey, meta]);

  // Navegador de dia (empresas únicas do dia selecionado do mês de referência).
  const dayNav = useMemo(() => {
    const monthDeals = filterDealsByTeam(deals, team).filter((d) => d.date && d.date.slice(0, 7) === monthKey);
    const [y, m] = monthKey.split("-").map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isCurrent = monthKey === cur;
    const isPast = monthKey < cur;
    const lastDay = isCurrent ? now.getDate() : isPast ? totalDays : 1;
    const firstKey = `${monthKey}-01`;
    const lastDayKey = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
    const sel = pickedDay && pickedDay.startsWith(monthKey) && pickedDay >= firstKey && pickedDay <= lastDayKey ? pickedDay : lastDayKey;
    const todayKey = now.toISOString().slice(0, 10);
    const dayDeals = monthDeals.filter((d) => d.date?.slice(0, 10) === sel);
    const dayCount = new Set(dayDeals.map((d) => uniqueDemandKey(d))).size;
    return { sel, firstKey, lastDayKey, dayCount, isToday: isCurrent && sel === todayKey, canPrev: sel > firstKey, canNext: sel < lastDayKey };
  }, [deals, team, monthKey, pickedDay]);
  const shiftDay = (delta: number) => {
    const d = new Date(`${dayNav.sel}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next >= dayNav.firstKey && next <= dayNav.lastDayKey) setPickedDay(next);
  };

  const oppsByDay = useMemo(() => computeOpportunitiesByDay(filterDealsByTeam(deals, team), monthKey, 7), [deals, team, monthKey]);
  const matrix = useMemo(() => computeFarmerMatrix(filtered), [filtered]);
  const macro = useMemo(() => computeMacroKPIs(filtered, matrix), [filtered, matrix]);
  const insights = useMemo(() => generateInsights(filtered, matrix), [filtered, matrix]);
  const stale = useMemo(() => computeStaleDeals(filtered), [filtered]);

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
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-end gap-3 w-full sm:w-auto">
                <div className="flex flex-col w-full sm:w-[172px]">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">Time</label>
                  <select value={team ?? ""} onChange={(e) => setTeam(e.target.value || null)} className="w-full rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10">
                    {TEAM_OPTIONS.map((t) => <option key={t.id ?? "all"} value={t.id ?? ""}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col w-full sm:w-[172px]">
                  <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">Período</label>
                  <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className="w-full rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10">
                    {PERIOD_OPTIONS.filter((p) => p.value !== "entre").map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
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
          {/* Cabeçalho MTD: dia + meta do mês (empresas únicas) + pace + composição */}
          <div className="rounded-2xl border-2 border-psa-orange/40 bg-gradient-to-br from-psa-orange/[0.07] to-transparent p-5">
            <div className="flex items-stretch gap-4 flex-wrap">
              {/* Navegador de dia */}
              <div className="rounded-xl border border-psa-line bg-psa-surface px-3 py-2.5 flex flex-col items-center justify-center min-w-[112px] shrink-0">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => shiftDay(-1)} disabled={!dayNav.canPrev} className="text-psa-muted hover:text-psa-ink disabled:opacity-30 text-sm leading-none">‹</button>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-psa-orange">{dayNav.isToday ? "Hoje" : fmtDM(dayNav.sel)}</span>
                  <button type="button" onClick={() => shiftDay(1)} disabled={!dayNav.canNext} className="text-psa-muted hover:text-psa-ink disabled:opacity-30 text-sm leading-none">›</button>
                </div>
                <div className="font-display text-3xl font-extrabold text-psa-ink tabular-nums leading-none mt-1">{num(dayNav.dayCount)}</div>
                <div className="text-[10px] text-psa-muted mt-0.5">{fmtDM(dayNav.sel)} · empresas</div>
              </div>

              {/* Meta do mês + barra + marcador meta-hoje */}
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-psa-orange">{monthLabel}{team ? " · " + TEAM_OPTIONS.find((t) => t.id === team)?.label : ""}</div>
                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                      <span className="font-display text-3xl font-extrabold text-psa-ink tabular-nums">{num(empresasNoMes)}</span>
                      <span className="text-sm text-psa-ink-soft">/ <b className="text-psa-ink">{num(meta)}</b> empresas únicas</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-extrabold text-psa-orange tabular-nums">{meta > 0 ? pct((empresasNoMes / meta) * 100) : "—"}</div>
                    <div className="text-[11px] text-psa-ink-soft">
                      {mtd.isCurrent ? "Meta do dia" : "Meta do mês"} <b className="text-psa-ink">{num(mtd.paceTarget)}</b>{" "}
                      <span className={`font-semibold ${mtd.diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>{mtd.diff >= 0 ? `+${mtd.diff} ↑` : `${mtd.diff} ↓`}</span>
                    </div>
                  </div>
                </div>
                <div className="relative mt-3">
                  <div className="h-3 rounded-full bg-psa-canvas overflow-hidden">
                    <div className="h-full rounded-full bg-psa-orange transition-all" style={{ width: `${meta > 0 ? Math.min(100, (empresasNoMes / meta) * 100) : 0}%` }} />
                  </div>
                  {meta > 0 && mtd.paceTarget > 0 && (
                    <div className="absolute top-0 h-3 border-l-2 border-psa-ink/60" style={{ left: `${Math.min(100, (mtd.paceTarget / meta) * 100)}%` }} title={`Meta ${mtd.isCurrent ? "hoje" : "do mês"}: ${mtd.paceTarget}`} />
                  )}
                </div>
              </div>
            </div>

            {/* Composição por origem (do mês) com anel de % */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Bucket label="Carteira do Farmer" n={mtd.carteira} total={mtd.total} hint="empresas únicas" color="#1E9E62" />
              <Bucket label="Ação de CRM" n={mtd.crm} total={mtd.total} hint="prospecção ativa" color="#E8631A" />
              <Bucket label="Convertido B2C" n={mtd.b2c} total={mtd.total} hint="closer B2C atribuído" color="#7C3AED" />
              <Bucket label="Com Criador" n={mtd.criador} total={mtd.total} hint={mtd.criticos > 0 ? `${mtd.criticos} críticos (>3d)` : "sdrfarmer = dono"} alert={mtd.criticos > 0} color="#DC2626" />
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

          {/* Fora do MOA (ordem do externo: logo após os KPIs) */}
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

          {/* Ranking de farmers (ordenável por coluna) */}
          <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Ranking de farmers · por {RANK_SORT_LABEL[rankSort.key]}</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[9px] font-bold uppercase tracking-wide text-psa-muted border-b border-psa-line">
                    <th className="text-left py-1.5 pr-2">#</th>
                    {rankTh({ k: "nome", label: "Farmer", className: "text-left py-1.5 pr-2" })}
                    {rankTh({ k: "score", label: "Score médio", className: "text-right py-1.5 px-2" })}
                    {rankTh({ k: "empresas", label: "Empresas", className: "text-right py-1.5 px-2" })}
                    {rankTh({ k: "negocios", label: "Negócios", className: "text-right py-1.5 px-2" })}
                    {rankTh({ k: "agend", label: "Agend.", className: "text-right py-1.5 px-2 hidden sm:table-cell" })}
                    {rankTh({ k: "realiz", label: "Realiz.", className: "text-right py-1.5 px-2 hidden sm:table-cell" })}
                    {rankTh({ k: "receita", label: "Receita", className: "text-right py-1.5 pl-2", title: "Negócios ganhos com o farmer como SDR/responsável, pela data de fechamento no período" })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-psa-line/60">
                  {sortedRanking.map((f, i) => {
                    const c = convById.get(f.farmerId);
                    const rev = revenueById.get(f.farmerId) ?? 0;
                    return (
                      <tr key={f.farmerId}>
                        <td className="py-1.5 pr-2 text-psa-muted tabular-nums">{i + 1}</td>
                        <td className="py-1.5 pr-2 text-psa-ink truncate max-w-[180px]" title={f.farmerName}>{f.farmerName}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-psa-ink">{dec(f.avgScore, 1)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(f.companyCount)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(f.dealCount)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft hidden sm:table-cell">{c ? `${c.scheduledPct}%` : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft hidden sm:table-cell">{c ? `${c.completedPct}%` : "—"}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-emerald-600">{rev > 0 ? brlK(rev) : "—"}</td>
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

          {/* Oportunidades por dia (empilhado por farmer) */}
          {oppsByDay.grandTotal > 0 && (
            <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Oportunidades por dia · {monthKey}</div>
                <div className="text-[11px] text-psa-ink-soft">{num(oppsByDay.grandTotal)} no mês</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {oppsByDay.owners.map((o, i) => (
                  <span key={o.name} className="inline-flex items-center gap-1 text-[10px] text-psa-ink-soft">
                    <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} /> {o.name}
                  </span>
                ))}
              </div>
              {(() => {
                const maxDay = Math.max(1, ...oppsByDay.rows.map((r) => Number(r.total) || 0));
                return (
                  <div className="mt-3 flex items-end gap-[3px] h-40 overflow-x-auto">
                    {oppsByDay.rows.map((r) => (
                      <div key={String(r.day)} className="flex flex-col items-center gap-1 shrink-0" style={{ minWidth: 20 }} title={`${r.day}: ${r.total}`}>
                        <div className="w-4 flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${((Number(r.total) || 0) / maxDay) * 136}px` }}>
                          {oppsByDay.owners.map((o, i) => {
                            const v = Number(r[o.name]) || 0;
                            const tot = Number(r.total) || 0;
                            return v === 0 ? null : <div key={o.name} style={{ height: `${(v / tot) * 100}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />;
                          })}
                        </div>
                        <span className="text-[8px] text-psa-muted tabular-nums">{String(r.day)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Insights · diagnóstico */}
          <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Diagnóstico · qualidade da qualificação</div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Mini label="Totalmente qualificados" value={pct(macro.fullyQualifiedRate * 100)} />
              <Mini label="Parados > 15 dias" value={num(macro.staleCount)} alert={macro.staleCount > 0} />
              <Mini label="Parados > 30 dias" value={num(macro.criticalStaleCount)} alert={macro.criticalStaleCount > 0} />
              <Mini label="Farmers em risco (<7)" value={num(macro.highRiskFarmers)} alert={macro.highRiskFarmers > 0} />
            </div>
            {insights.length > 0 && (
              <div className="mt-4 space-y-2">
                {insights.slice(0, 6).map((ins, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-[12px] ${INSIGHT_STYLE[ins.type]}`}>
                    <b>{ins.title}</b> <span className="opacity-80">· {ins.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matriz de farmers */}
          <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Matriz de farmers · qualidade e saúde da carteira</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[9px] font-bold uppercase tracking-wide text-psa-muted border-b border-psa-line">
                    <th className="text-left py-1.5 pr-2">Farmer</th>
                    <th className="text-right py-1.5 px-2">Negócios</th>
                    <th className="text-right py-1.5 px-2">Score médio</th>
                    <th className="text-right py-1.5 px-2">% completos</th>
                    <th className="text-right py-1.5 px-2 hidden sm:table-cell">Parados</th>
                    <th className="text-right py-1.5 pl-2 hidden sm:table-cell">Dias médios</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-psa-line/60">
                  {matrix.map((f) => (
                    <tr key={f.farmerId}>
                      <td className="py-1.5 pr-2 text-psa-ink truncate max-w-[180px]" title={f.farmerName}>{f.farmerName}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{num(f.dealCount)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-psa-ink">{dec(f.avgScore, 1)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-psa-ink-soft">{pct(f.completionRate * 100)}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums hidden sm:table-cell ${f.staleDealCount > 0 ? "text-red-600 font-semibold" : "text-psa-muted"}`}>{num(f.staleDealCount)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-psa-ink-soft hidden sm:table-cell">{Math.round(f.avgDaysSinceQualification)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Negócios parados */}
          {stale.length > 0 && (
            <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Negócios parados · sem atualização há +15 dias ({num(stale.length)})</div>
              <div className="mt-3 divide-y divide-psa-line/60">
                {stale.slice(0, 15).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                    <a href={d.hubspotUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-psa-ink hover:text-psa-orange hover:underline" title={d.name}>{d.name}</a>
                    <span className="shrink-0 text-psa-ink-soft">{d.farmerName}</span>
                    <span className="shrink-0 w-16 text-right tabular-nums text-red-600 font-semibold">{num(d.daysSinceModified)}d</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const SERIES_COLORS = ["#E8631A", "#2563EB", "#1E9E62", "#7C3AED", "#D97706", "#DC2626", "#64748B", "#0891B2"];
const INSIGHT_STYLE: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function CompRing({ pct, color }: { pct: number; color: string }) {
  const r = 15.5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="40" height="40" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" className="text-psa-line" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x="18" y="19.5" textAnchor="middle" fill={color} fontSize="8" fontWeight="700">{pct}%</text>
    </svg>
  );
}

function Bucket({ label, n, total, hint, alert, color }: { label: string; n: number; total: number; hint?: string; alert?: boolean; color: string }) {
  const p = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div className="rounded-xl bg-psa-surface border border-psa-line p-3 flex items-center justify-between gap-2" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-psa-ink-soft leading-tight">{label}</div>
        <div className="mt-1 font-display text-2xl font-extrabold text-psa-ink tabular-nums leading-none">{n.toLocaleString("pt-BR")}</div>
        {hint && <div className={`mt-1 text-[10px] ${alert ? "text-red-600 font-medium" : "text-psa-muted"}`}>{hint}</div>}
      </div>
      <CompRing pct={p} color={color} />
    </div>
  );
}

function Mini({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-xl bg-psa-canvas/50 border border-psa-line p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-psa-ink-soft leading-tight">{label}</div>
      <div className={`mt-1 font-display text-xl font-extrabold tabular-nums ${alert ? "text-red-600" : "text-psa-ink"}`}>{value}</div>
    </div>
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
