"use client";

import { useEffect, useMemo, useState } from "react";
import KpiCard from "@/components/KpiCard";
import StageFunnel from "@/components/StageFunnel";
import CloserTable from "@/components/CloserTable";
import DealListModal from "@/components/DealListModal";
import { allDealsOf, type CloserRow, type DashboardData } from "@/lib/aggregate";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

export default function Page() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ row: CloserRow; stageId: string | "total" } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
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
  }, []);

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
    if (!modal) return [];
    return modal.stageId === "total" ? allDealsOf(modal.row) : modal.row.dealsPorEtapa[modal.stageId] ?? [];
  }, [modal]);

  const modalStageLabel = useMemo(() => {
    if (!modal || !data) return "";
    if (modal.stageId === "total") return "Todos os negócios ativos";
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
              </p>
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
          value={data ? num(data.closers.length) : 0}
          accent="ink"
          hint="Proprietários com ao menos 1 negócio ativo"
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

      {/* Funil por etapa */}
      {data && <StageFunnel stages={data.stages} porEtapa={data.totals.porEtapa} loading={loading} />}

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
          onOpenStage={(row, stageId) => setModal({ row, stageId })}
        />
      </section>

      <DealListModal
        open={modal !== null}
        onClose={() => setModal(null)}
        closerName={modal?.row.nome ?? ""}
        stageLabel={modalStageLabel}
        deals={modalDeals}
      />
    </main>
  );
}
