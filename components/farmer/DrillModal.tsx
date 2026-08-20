"use client";

import { useEffect } from "react";
import type { DealLite, TicketLite } from "@/lib/farmer/aggregate";

/** Item agregado (clique no card): DealLite + nome do farmer responsável. */
export type AggregatedDealItem = DealLite & { ownerName: string };
export type AggregatedTicketItem = TicketLite & { ownerName: string };

// Portal (Hub) ID do HubSpot — monta o link de cada registro.
// Override via NEXT_PUBLIC_HUBSPOT_PORTAL_ID; default é o portal da PSA.
const HUBSPOT_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "49656171";

// Link direto pro registro. objectTypeId: deals = 0-3, tickets = 0-5, meetings = 0-47.
const OBJ_TYPE_ID: Record<"deal" | "ticket" | "meeting" | "company", string> = { deal: "0-3", ticket: "0-5", meeting: "0-47", company: "0-2" };
const hubspotRecordUrl = (objeto: "deal" | "ticket" | "meeting" | "company", id: string) =>
  `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/${OBJ_TYPE_ID[objeto]}/${id}`;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nota2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

// "receita" reusa a lista de negócios (mesmos deals ganhos), só muda o título.
export type ModalKind =
  | "demandas"
  | "empresas_unicas"
  | "fora_moa"
  | "aberto"
  | "negocios"
  | "perdidos"
  | "receita"
  | "tramitacoes"
  | "tramitacoes_criadas"
  | "reunioes_agendadas"
  | "reunioes_realizadas";

const TITLES: Record<ModalKind, { titulo: string; sing: string; plural: string }> = {
  demandas: { titulo: "Demandas levantadas", sing: "demanda", plural: "demandas" },
  empresas_unicas: { titulo: "Empresas únicas", sing: "empresa", plural: "empresas" },
  fora_moa: { titulo: "Fora do MOA (não conta)", sing: "negócio", plural: "negócios" },
  aberto: { titulo: "Negócios em aberto", sing: "negócio em aberto", plural: "negócios em aberto" },
  negocios: { titulo: "Negócios fechados", sing: "negócio fechado", plural: "negócios fechados" },
  perdidos: { titulo: "Negócios perdidos", sing: "negócio perdido", plural: "negócios perdidos" },
  receita: { titulo: "Receita · negócios fechados", sing: "negócio fechado", plural: "negócios fechados" },
  tramitacoes: { titulo: "Tramitações em andamento", sing: "tramitação", plural: "tramitações" },
  tramitacoes_criadas: { titulo: "Tramitações criadas no mês", sing: "tramitação", plural: "tramitações" },
  reunioes_agendadas: { titulo: "Reuniões agendadas", sing: "reunião", plural: "reuniões" },
  reunioes_realizadas: { titulo: "Reuniões realizadas", sing: "reunião", plural: "reuniões" },
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nome do farmer (modo individual) OU título do escopo (modo agregado, ex.: "Geral", "Squad Daniel") */
  scopeLabel: string;
  kind: ModalKind;
  /** Deals a listar (demandas/negocios/receita). Já com ownerName quando agregado. */
  deals?: Array<DealLite | AggregatedDealItem>;
  /** Tickets a listar (tramitacoes). Já com ownerName quando agregado. */
  tickets?: Array<TicketLite | AggregatedTicketItem>;
};

export default function DrillModal({ open, onClose, scopeLabel, kind, deals, tickets }: Props) {
  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Bloqueia scroll do body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const isReuniao = kind === "reunioes_agendadas" || kind === "reunioes_realizadas";
  const isTickets = kind === "tramitacoes" || kind === "tramitacoes_criadas" || isReuniao;
  // negócios e receita mostram valor monetário
  const showAmount = kind === "negocios" || kind === "receita";
  const labels = TITLES[kind];

  const dealItems = deals ?? [];
  const ticketItems = tickets ?? [];
  const total = isTickets ? ticketItems.length : dealItems.length;

  const receitaTotal = showAmount ? dealItems.reduce((s, d) => s + d.amount, 0) : 0;
  const ticketMedio = showAmount && total > 0 ? receitaTotal / total : 0;

  const ownerOf = (item: DealLite | TicketLite): string | null =>
    (item as { ownerName?: string }).ownerName ?? null;

  // Divisão da lista (estilo "vendas por closer" da Meta do mês): por FARMER
  // quando é agregado (vários farmers) ou por ORIGEM do lead quando é de um só.
  // Empresas únicas não agrupa.
  const agrupaDeals = !isTickets && kind !== "empresas_unicas" && dealItems.length > 0;
  const groupByOwner = dealItems.some((d) => ownerOf(d));
  const hideOwnerInItem = agrupaDeals && groupByOwner;
  const hideOrigemInItem = agrupaDeals && !groupByOwner;
  const dealGroups = (() => {
    if (!agrupaDeals) return [] as Array<{ key: string; deals: Array<DealLite | AggregatedDealItem> }>;
    const m = new Map<string, Array<DealLite | AggregatedDealItem>>();
    for (const d of dealItems) {
      const key = (groupByOwner ? ownerOf(d) : d.origemLead) || (groupByOwner ? "Sem responsável" : "Sem origem");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"))
      .map(([key, deals]) => ({ key, deals }));
  })();

  // Um item da lista de negócios (reaproveitado no modo agrupado e no flat).
  const renderDeal = (d: DealLite | AggregatedDealItem, i: number) => (
    <a
      href={kind === "empresas_unicas" && d.companyId ? hubspotRecordUrl("company", d.companyId) : hubspotRecordUrl("deal", d.id)}
      target="_blank"
      rel="noopener noreferrer"
      className="group px-6 py-3 flex items-start gap-4"
      title={kind === "empresas_unicas" && d.companyId ? "Abrir empresa no HubSpot" : "Abrir negócio no HubSpot"}
    >
      <span className="text-xs font-mono text-white/40 tabular-nums w-8">{String(i + 1).padStart(2, "0")}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm truncate group-hover:text-psa-orange group-hover:underline ${d.foraMoa ? "text-white/40 line-through" : "text-white/90"} ${kind === "empresas_unicas" && !d.companyId ? "italic text-white/50" : ""}`}>
            {kind === "empresas_unicas" ? (d.companyName || "— sem empresa vinculada —") : d.dealname}
          </span>
          {d.foraMoa && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[9px] font-bold uppercase tracking-wide">
              Fora do MOA · não conta
            </span>
          )}
        </div>
        {(kind === "empresas_unicas" || (!hideOwnerInItem && ownerOf(d)) || (!hideOrigemInItem && d.origemLead)) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/50 truncate">
            {kind === "empresas_unicas" && <span className="text-white/40">Negócio: {d.dealname}</span>}
            {!hideOwnerInItem && ownerOf(d) && <span>{ownerOf(d)}</span>}
            {!hideOrigemInItem && d.origemLead && <span className="text-white/40">Origem: {d.origemLead}</span>}
          </div>
        )}
        {kind !== "empresas_unicas" && d.nota != null && (
          <div className="mt-0.5 text-[11px]">
            <span className="font-semibold text-psa-orange">Nota {nota2(d.nota)}/12</span>
            {d.criteriosFaltantes && d.criteriosFaltantes.length > 0 ? (
              <span className="text-white/45"> · Faltam: {d.criteriosFaltantes.join(", ")}</span>
            ) : (
              <span className="text-emerald-400"> · nota máxima ✓</span>
            )}
          </div>
        )}
      </div>
      <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
      {showAmount && (
        <div className="text-xs font-medium text-psa-orange tabular-nums whitespace-nowrap">{brl(d.amount)}</div>
      )}
      <div className="text-xs text-white/60 tabular-nums whitespace-nowrap w-16 text-right">{fmtDate(d.date)}</div>
    </a>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drill-modal-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="drill-modal-title" className="font-display text-xl font-bold truncate">
                {labels.titulo}
              </h3>
              <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
                {scopeLabel} · {total} {total === 1 ? labels.sing : labels.plural}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          {showAmount && total > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Negócios</div>
                <div className="mt-1 font-display text-2xl font-bold text-psa-orange tabular-nums">{total}</div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Receita Total</div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(receitaTotal)}
                </div>
              </div>
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Ticket Médio</div>
                <div className="mt-1 font-display text-xl font-bold text-psa-orange tabular-nums whitespace-nowrap">
                  {brl(ticketMedio)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {total === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">
              Nenhum registro encontrado.
            </div>
          ) : (
            isTickets ? (
              <ol className="divide-y divide-white/10">
                {ticketItems.map((t, i) => (
                  <li key={t.id} className="hover:bg-white/[0.03] transition-colors">
                    <a
                      href={hubspotRecordUrl(isReuniao ? "meeting" : "ticket", t.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group px-6 py-3 flex items-center gap-4"
                      title={isReuniao ? "Abrir reunião no HubSpot" : "Abrir ticket no HubSpot"}
                    >
                      <span className="text-xs font-mono text-white/40 tabular-nums w-8">{String(i + 1).padStart(2, "0")}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/90 truncate group-hover:text-psa-orange group-hover:underline">{t.subject}</div>
                        {ownerOf(t) && <div className="mt-0.5 text-[11px] text-white/50 truncate">{ownerOf(t)}</div>}
                      </div>
                      <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
                      <div className="text-xs text-white/60 tabular-nums whitespace-nowrap">{fmtDate(t.date)}</div>
                    </a>
                  </li>
                ))}
              </ol>
            ) : agrupaDeals ? (
              <div className="divide-y divide-white/10">
                {dealGroups.map(({ key, deals }) => {
                  const soma = deals.reduce((s, d) => s + d.amount, 0);
                  return (
                    <div key={key} className="px-6 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-white/90 truncate">{key}</span>
                        <span className="text-[11px] font-semibold text-psa-orange whitespace-nowrap">
                          {deals.length} {deals.length === 1 ? labels.sing : labels.plural}
                          {showAmount ? ` · ${brl(soma)}` : ""}
                        </span>
                      </div>
                      <ul className="mt-1 -mx-6 border-l-2 border-psa-orange/30 ml-1">
                        {deals.map((d, i) => (
                          <li key={d.id} className="hover:bg-white/[0.03] transition-colors">
                            {renderDeal(d, i)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ol className="divide-y divide-white/10">
                {dealItems.map((d, i) => (
                  <li key={d.id} className="hover:bg-white/[0.03] transition-colors">
                    {renderDeal(d, i)}
                  </li>
                ))}
              </ol>
            )
          )}
        </div>
      </div>
    </div>
  );
}
