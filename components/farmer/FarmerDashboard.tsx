"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import KpiCard from "@/components/farmer/KpiCard";
import FarmerTable from "@/components/farmer/FarmerTable";
import FarmersToolbar, { type FarmerFilter } from "@/components/farmer/FarmersToolbar";
import PeriodFilter from "@/components/farmer/PeriodFilter";
import DrillModal, {
  type ModalKind,
  type AggregatedDealItem,
  type AggregatedTicketItem,
} from "@/components/farmer/DrillModal";
import { computePeriod, type PeriodValue } from "@/lib/farmer/periods";
import type { DashboardData, FarmerRow, DealLite, TicketLite } from "@/lib/farmer/aggregate";
import { SQUADS, type TabValue } from "@/lib/farmer/teams";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

type View = {
  demandas: number;
  emAberto: number;
  negocios: number;
  perdidos: number;
  semGanhos: number;
  receita: number;
  tramitacoes: number;
  tramitacoesCriadas: number;
  reunioesAgendadas: number;
  reunioesRealizadas: number;
  farmers: FarmerRow[];
  leader?: string;
};

function computeView(data: DashboardData | null, tab: TabValue): View | null {
  if (!data) return null;
  if (tab === "all") {
    return {
      ...data.geral,
      farmers: [...data.squads]
        .flatMap((s) => s.farmers)
        .sort((a, b) => b.receita - a.receita || b.negocios - a.negocios || b.demandas - a.demandas),
    };
  }
  const squad = data.squads.find((s) => s.id === tab);
  if (!squad) return null;
  return {
    demandas: squad.demandas,
    emAberto: squad.emAberto,
    negocios: squad.negocios,
    perdidos: squad.perdidos,
    semGanhos: squad.semGanhos,
    receita: squad.receita,
    tramitacoes: squad.tramitacoes,
    tramitacoesCriadas: squad.tramitacoesCriadas,
    reunioesAgendadas: squad.reunioesAgendadas,
    reunioesRealizadas: squad.reunioesRealizadas,
    farmers: squad.farmers,
    leader: squad.leader,
  };
}

const TABS: { id: TabValue; label: string }[] = [
  { id: "all", label: "Geral" },
  ...SQUADS.map((s) => ({ id: s.id as TabValue, label: s.label })),
];

// Regras de cada indicador (mostradas no popover ⓘ do card).
// Usa o nome de exibição das propriedades do HubSpot, não os internos.
const RULES = {
  demandas: [
    "Origem conforme o seletor: Carteira / Ação de CRM / Indicação / Palestrante / Qualificação Farmer / Todas",
    'Carteira = origem_do_lead "Carteira do Farmer" · Qualificação Farmer = origem_da_qualificacao "Farmer"',
    "SDR/Farmer Responsável = farmer do squad",
    "Data de Qualificação dentro do mês",
    "Qualquer fase do negócio (todas as fases contam)",
  ],
  negocios: [
    "Origem conforme o seletor: Carteira / Ação de CRM / Indicação / Palestrante / Qualificação Farmer / Todas",
    'Carteira = origem_do_lead "Carteira do Farmer" · Qualificação Farmer = origem_da_qualificacao "Farmer"',
    "SDR/Farmer Responsável = farmer do squad",
    "Data de Fechamento dentro do mês (fuso de Brasília)",
    'Fase do negócio = "Negócio fechado" ou "Ganho / Contrato assinado"',
  ],
  receita: [
    "Soma do valor dos negócios fechados (mesmos filtros de Negócios fechados)",
    "Valor: Valor do contrato (Bruto) ou Valor (Líquido), conforme o botão Bruto/Líquido",
    "Origem do lead conforme o seletor · Data de Fechamento no mês",
  ],
  tramitacoes: [
    "Tickets da pipeline de CS",
    'Etapa do ticket = "Em andamento" ou "Iniciar Trâmites"',
    "Proprietário do ticket = farmer do squad",
    "Snapshot ao vivo: backlog atual (ignora o filtro de período)",
  ],
  tramitacoesCriadas: [
    "Tickets da pipeline de CS",
    'Etapa do ticket = "Em andamento" ou "Iniciar Trâmites"',
    "Proprietário do ticket = farmer do squad",
    "Data de criação do ticket dentro do mês",
  ],
  reunioes: [
    "Objeto: Reuniões",
    "Criado por ID do Usuário = farmer do squad",
    "Reunião associada a um negócio na pipeline B2B (Funil de Vendas B2B)",
    "Data de criação da reunião dentro do mês",
    "Realizadas = reuniões com resultado “Realizada”",
  ],
};

const tabLabel = (tab: TabValue) => TABS.find((t) => t.id === tab)?.label ?? "Geral";

// Modal: ou agregado (clique no card → todos farmers do escopo) ou individual
// (clique numa linha da tabela → um farmer).
type ModalState =
  | { mode: "aggregated"; kind: ModalKind }
  | { mode: "single"; kind: ModalKind; farmer: FarmerRow; stage?: string }
  | null;

// Lista de deals de um farmer pra uma métrica (receita reusa negócios).
function dealsOf(f: FarmerRow, kind: ModalKind): DealLite[] {
  if (kind === "demandas") return f.demandasDeals;
  if (kind === "aberto") return f.emAbertoDeals;
  if (kind === "negocios" || kind === "receita") return f.negociosDeals;
  if (kind === "perdidos") return f.perdidosDeals;
  return [];
}

// Lista de tickets/reuniões de um farmer pra abrir no modal (formato TicketLite).
function ticketsOf(f: FarmerRow, kind: ModalKind): TicketLite[] {
  if (kind === "tramitacoes") return f.tramitacoesTickets;
  if (kind === "tramitacoes_criadas") return f.tramitacoesCriadasTickets;
  if (kind === "reunioes_agendadas")
    return f.reunioesList.map((r) => ({ id: r.id, subject: r.title, date: r.date }));
  if (kind === "reunioes_realizadas")
    return f.reunioesList.filter((r) => r.realizada).map((r) => ({ id: r.id, subject: r.title, date: r.date }));
  return [];
}

const isTicketKind = (kind: ModalKind) =>
  kind === "tramitacoes" ||
  kind === "tramitacoes_criadas" ||
  kind === "reunioes_agendadas" ||
  kind === "reunioes_realizadas";

export default function FarmerDashboard({ segmentSelector }: { segmentSelector?: ReactNode }) {
  const [period, setPeriod] = useState<PeriodValue>(() => computePeriod("this_month"));
  const [mode, setMode] = useState<"bruto" | "liquido">("bruto");
  const [origem, setOrigem] = useState<
    "carteira" | "acao_crm" | "indicacao" | "palestrante" | "qualif_farmer" | "todas"
  >("todas");
  const [tab, setTab] = useState<TabValue>("all");
  const [accessKey, setAccessKey] = useState<string>("");
  const [modal, setModal] = useState<ModalState>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FarmerFilter>("todos");
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [alertExpanded, setAlertExpanded] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

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
    qs.set("mode", mode);
    qs.set("origem", origem);
    if (accessKey) qs.set("key", accessKey);
    return qs.toString();
  }, [period.from, period.to, mode, origem, accessKey]);

  async function load() {
    setLoading(true);
    setError(null);
    setAlertDismissed(false);
    setAlertExpanded(false);
    try {
      const res = await fetch(`/api/farmer?${queryString}`);
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

  const view = computeView(data, tab);
  const csAtivo = !!data?.meta.pipelineCsAtivo;
  const meetingsDisponivel = data?.meta.meetingsDisponivel ?? true;

  // Filtro da tabela (Todos / Com ganhos / Sem ganhos) + busca por nome.
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filteredFarmers = useMemo(() => {
    if (!view) return [];
    const q = normalize(search.trim());
    return view.farmers.filter((f) => {
      if (filter === "com_ganhos" && f.negocios === 0) return false;
      if (filter === "sem_ganhos" && f.negocios > 0) return false;
      if (q && !normalize(f.nome).includes(q)) return false;
      return true;
    });
  }, [view, search, filter]);

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

  // Card só é clicável quando há registros pra mostrar.
  const openAggregated = (kind: ModalKind, count: number) =>
    count > 0 ? () => setModal({ mode: "aggregated", kind }) : undefined;

  // Monta as listas do modal conforme estado (agregado vs individual).
  const modalData = useMemo(() => {
    if (!modal || !view) return { deals: undefined, tickets: undefined, scopeLabel: "" };

    if (isTicketKind(modal.kind)) {
      if (modal.mode === "single") {
        return {
          deals: undefined,
          tickets: ticketsOf(modal.farmer, modal.kind) as TicketLite[],
          scopeLabel: modal.farmer.nome,
        };
      }
      const tickets: AggregatedTicketItem[] = view.farmers.flatMap((f) =>
        ticketsOf(f, modal.kind).map((t) => ({ ...t, ownerName: f.nome }))
      );
      return { deals: undefined, tickets, scopeLabel: tabLabel(tab) };
    }

    if (modal.mode === "single") {
      let deals = dealsOf(modal.farmer, modal.kind);
      // Clique numa barra do gráfico por etapa → filtra pela etapa.
      if (modal.stage) deals = deals.filter((d) => (d.stage || "—") === modal.stage);
      return {
        deals,
        tickets: undefined,
        scopeLabel: modal.stage ? `${modal.farmer.nome} · ${modal.stage}` : modal.farmer.nome,
      };
    }
    const deals: AggregatedDealItem[] = view.farmers.flatMap((f) =>
      dealsOf(f, modal.kind).map((d) => ({ ...d, ownerName: f.nome }))
    );
    return { deals, tickets: undefined, scopeLabel: tabLabel(tab) };
  }, [modal, view, tab]);

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

        <div className="relative px-8 py-8 min-h-[240px]">
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  PSA · Líderes Táticos
                </span>
              </div>
              <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-tight text-white">
                Performance
                <br />
                <span className="text-psa-orange">dos Times.</span>
              </h1>
              <p className="mt-4 text-sm text-white/85 max-w-md">
                Demandas, negócios e tramitações da carteira dos farmers, por squad.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full lg:w-auto lg:shrink-0">
              <div className="flex items-start gap-2.5 flex-wrap">
              {/* Filtros agrupados numa caixa só */}
              <div className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-xl px-4 py-3 flex items-end gap-4 flex-wrap">
                <PeriodFilter value={period} onChange={handlePeriodChange} />

                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">Origem</div>
                  <select
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value as typeof origem)}
                    className="rounded-lg border border-psa-line bg-psa-surface px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[170px]"
                  >
                    <option value="carteira">Carteira</option>
                    <option value="acao_crm">Ação de CRM</option>
                    <option value="indicacao">Indicação</option>
                    <option value="palestrante">Palestrante</option>
                    <option value="qualif_farmer">Qualificação Farmer</option>
                    <option value="todas">Todas</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/85 mb-2">Receita</div>
                  <div className="inline-flex rounded-lg bg-black/15 border border-white/10 p-0.5 text-sm">
                    <button
                      onClick={() => setMode("bruto")}
                      className={`px-3 py-1.5 rounded-md transition-all font-semibold ${
                        mode === "bruto" ? "bg-psa-orange text-white shadow-sm" : "text-white/70 hover:text-white"
                      }`}
                    >
                      Bruto
                    </button>
                    <button
                      onClick={() => setMode("liquido")}
                      className={`px-3 py-1.5 rounded-md transition-all font-semibold ${
                        mode === "liquido" ? "bg-psa-orange text-white shadow-sm" : "text-white/70 hover:text-white"
                      }`}
                    >
                      Líquido
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-[200px]">
              {segmentSelector}
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-sm font-semibold text-white/90 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-60 disabled:cursor-wait"
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

              {/* Seletor de squads — abaixo dos filtros, ocupa toda a largura
                  (até o fim do Atualizar); pills esticados edge-to-edge. */}
              <div className="flex flex-col gap-1.5">
                <div className="flex w-full rounded-xl bg-white/[0.06] border border-white/10 p-1 gap-1">
                  {TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        aria-pressed={active}
                        className={`flex-1 whitespace-nowrap text-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                          active ? "bg-psa-orange text-white shadow" : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {view?.leader && (
                  <span className="text-[11px] text-white/70 px-1">
                    Líder <span className="font-bold text-white">{view.leader}</span>
                  </span>
                )}
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
          {error.includes("unauthorized") && (
            <div className="mt-2 text-xs text-red-700">
              Adicione <code className="px-1 py-0.5 bg-red-100 rounded">?key=SUA_CHAVE</code> à URL.
            </div>
          )}
          {error.includes("429") && (
            <div className="mt-2 text-xs text-red-700">
              Rate limit do HubSpot. Aguarde alguns segundos e atualize.
            </div>
          )}
        </div>
      )}

      {/* Alerta dismissível: negócios de Qualificação Farmer sem dono de empresa */}
      {data && data.alertasQualifSemDono.length > 0 && !alertDismissed && (
        <div className="relative rounded-2xl border border-amber-300 bg-amber-50 p-4 pr-10 text-sm text-amber-900">
          <button
            type="button"
            onClick={() => setAlertDismissed(true)}
            className="absolute top-3 right-3 text-amber-500 hover:text-amber-800 text-lg leading-none"
            aria-label="Fechar alerta"
            title="Fechar"
          >
            ×
          </button>
          <div className="font-display font-semibold mb-1">
            {data.alertasQualifSemDono.length}{" "}
            {data.alertasQualifSemDono.length === 1 ? "negócio" : "negócios"} de Qualificação Farmer sem
            Proprietário de empresa
          </div>
          <div className="text-amber-800 text-xs mb-2">
            Esses negócios têm Origem da qualificação = &quot;Farmer&quot; mas a empresa associada não tem
            Proprietário (ou o Proprietário não é um farmer do painel), então não foram atribuídos a ninguém.
            Defina o Proprietário da empresa no HubSpot pra eles entrarem na conta.
          </div>
          <ul className={`space-y-0.5 text-xs ${alertExpanded ? "max-h-60 overflow-y-auto pr-1" : ""}`}>
            {(alertExpanded ? data.alertasQualifSemDono : data.alertasQualifSemDono.slice(0, 8)).map((a) => (
              <li key={a.dealId}>
                <a
                  href={`https://app.hubspot.com/contacts/${
                    process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "49656171"
                  }/record/0-3/${a.dealId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-amber-900 hover:underline"
                >
                  {a.dealname}
                </a>
              </li>
            ))}
          </ul>
          {data.alertasQualifSemDono.length > 8 && (
            <button
              type="button"
              onClick={() => setAlertExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-amber-800 hover:text-amber-900 hover:underline"
            >
              {alertExpanded ? "mostrar menos" : `+${data.alertasQualifSemDono.length - 8} outros…`}
            </button>
          )}
        </div>
      )}

      {/* KPIs — 5 cards (clicáveis: abrem a lista do escopo atual) */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Demandas levantadas"
          value={view ? num(view.demandas) : 0}
          accent="blue"
          hint={
            origem === "carteira"
              ? "Origem: Carteira"
              : origem === "acao_crm"
              ? "Origem: Ação de CRM"
              : origem === "indicacao"
              ? "Origem: Indicação"
              : origem === "palestrante"
              ? "Origem: Palestrante"
              : origem === "qualif_farmer"
              ? "Origem: Qualificação Farmer"
              : "Origem: todas (Carteira + Ação CRM + Indicação + Palestrante + Qualif.)"
          }
          loading={loading}
          onClick={view ? openAggregated("demandas", view.demandas) : undefined}
          info={RULES.demandas}
        />
        <KpiCard
          label="Negócios fechados"
          value={view ? num(view.negocios) : 0}
          accent="orange"
          hint="Contrato assinado (ganho)"
          loading={loading}
          onClick={view ? openAggregated("negocios", view.negocios) : undefined}
          info={RULES.negocios}
        />
        <KpiCard
          label="Receita total"
          value={view ? brl(view.receita) : "R$ 0,00"}
          accent="orange"
          hint={mode === "bruto" ? "Valor bruto do contrato" : "Valor líquido"}
          loading={loading}
          onClick={view ? openAggregated("receita", view.negocios) : undefined}
          info={RULES.receita}
        />
        <KpiCard
          label="Tramitações em andamento"
          value={view ? num(view.tramitacoes) : 0}
          accent="ink"
          hint={csAtivo ? "Backlog atual ao vivo" : "Pipeline CS não configurada"}
          loading={loading}
          onClick={view ? openAggregated("tramitacoes", view.tramitacoes) : undefined}
          info={RULES.tramitacoes}
        />
        <KpiCard
          label="Tramitações criadas no mês"
          value={view ? num(view.tramitacoesCriadas) : 0}
          accent="blue"
          hint={csAtivo ? "Criadas no período (Iniciar/Em andamento)" : "Pipeline CS não configurada"}
          loading={loading}
          onClick={view ? openAggregated("tramitacoes_criadas", view.tramitacoesCriadas) : undefined}
          info={RULES.tramitacoesCriadas}
        />
        <KpiCard
          label="Reuniões (realiz./agend.)"
          value={view ? `${num(view.reunioesRealizadas)} / ${num(view.reunioesAgendadas)}` : "0 / 0"}
          accent="blue"
          hint={
            !meetingsDisponivel
              ? "Sem acesso a Reuniões (verificar scope)"
              : view && view.reunioesAgendadas > 0
              ? `${Math.round((view.reunioesRealizadas / view.reunioesAgendadas) * 100)}% realizadas`
              : "Realizadas / agendadas no mês"
          }
          loading={loading}
          info={RULES.reunioes}
        />
      </section>

      {/* Tabela por farmer (números clicáveis abrem a lista do farmer) */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-psa-ink">Detalhe por farmer</h2>
          {data && !loading && view && (
            <span className="text-xs text-psa-ink-soft">
              {filteredFarmers.length}/{view.farmers.length}{" "}
              {view.farmers.length === 1 ? "farmer" : "farmers"}
              {updatedAtFormatted && (
                <>
                  {" · "}
                  <span title="Última atualização dos dados">Atualizado {updatedAtFormatted}</span>
                </>
              )}
            </span>
          )}
        </div>

        <FarmersToolbar search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} />

        <FarmerTable
          rows={filteredFarmers}
          loading={loading}
          csAtivo={csAtivo}
          onDrillDown={(farmer, kind, stage) => setModal({ mode: "single", kind, farmer, stage })}
          stageOrder={data?.meta.stageOrder ?? []}
        />
      </section>

      {/* Modal de drill-down */}
      <DrillModal
        open={modal !== null}
        onClose={() => setModal(null)}
        scopeLabel={modalData.scopeLabel}
        kind={modal?.kind ?? "demandas"}
        deals={modalData.deals}
        tickets={modalData.tickets}
      />
    </main>
  );
}
