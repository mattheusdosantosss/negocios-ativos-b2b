"use client";

import { useEffect, useState } from "react";
import type { ConversionData } from "@/lib/aggregate";
import type { MotivosData, MotivosItem } from "@/lib/hubspot";
import type { GanhosAtributosData } from "@/lib/b2cCards";
import GanhosAtributosCard from "./GanhosAtributosCard";

// Cores do split de proposta anexada (mesma paleta do gráfico de temperatura).
const COM_FILL = "#1E9E62"; // com proposta
const SEM_FILL = "#E8A317"; // sem proposta

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const pctND = (n: number, d: number) => (d > 0 ? pct(n / d) : "0%");
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: ConversionData; motivos?: MotivosData; forcedMonth?: string | null; showProposta?: boolean; ganhosAtributos?: GanhosAtributosData };

/**
 * Taxa de conversão (ganho × perdido) + motivos de perda no mesmo card. Segue o
 * filtro de tempo do topo: quando `forcedMonth` (YYYY-MM) vem setado, trava o
 * card nesse mês e esconde o seletor; senão, seletor de mês próprio.
 */
export default function ConversionCard({ data, motivos, forcedMonth, showProposta, ganhosAtributos }: Props) {
  const [monthState, setMonth] = useState<string>("all");
  const [open, setOpen] = useState<{ name: string; deals: MotivosItem[] } | null>(null);

  // forcedMonth (do filtro de tempo) manda; se não, usa o seletor interno.
  const forced = forcedMonth != null;
  const month = forced ? forcedMonth : monthState;

  const scope = month === "all" ? data.geral : data.months.find((m) => m.key === month) ?? data.geral;
  const scopeLabel = month === "all" ? "todo o histórico" : data.months.find((m) => m.key === month)?.label ?? month;
  const mScope = !motivos ? null : month === "all" ? motivos.geral : motivos.months.find((m) => m.key === month) ?? motivos.geral;
  const mMax = mScope?.reasons[0]?.count ?? 1;

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Taxa de conversão</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(scope.conv)}</span>
            <span className="text-sm text-psa-ink-soft">
              <b className="text-psa-ink">{num(scope.won)}</b> ganhos ·{" "}
              <b className="text-psa-ink">{num(Math.max(0, scope.entered - scope.won))}</b> perdidos ·{" "}
              <span className="text-psa-muted">{scopeLabel}</span>
            </span>
          </div>
          {data.denomLabel && <div className="mt-1 text-[11px] text-psa-muted">{data.denomLabel}</div>}
        </div>

        <div className="flex flex-col shrink-0">
          <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">
            {data.monthFilterLabel}
          </label>
          {forced ? (
            // Travado pelo filtro de tempo do topo — mostra o mês, sem seletor.
            <div className="rounded-lg border border-psa-line bg-psa-canvas px-3 py-2 text-sm text-psa-ink min-w-[190px]">
              {scopeLabel} <span className="text-psa-muted text-xs">· pelo filtro de tempo</span>
            </div>
          ) : (
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-psa-line bg-psa-canvas px-3 py-2 text-sm text-psa-ink focus:outline-none focus:border-psa-blue focus:ring-2 focus:ring-psa-blue/10 min-w-[190px]"
            >
              <option value="all">Geral (todo o histórico)</option>
              {data.months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Ganhos por atributo — detalha o lado dos ganhos (só B2C). */}
      {ganhosAtributos && ganhosAtributos.total > 0 && <GanhosAtributosCard data={ganhosAtributos} />}

      {mScope && mScope.total > 0 && (
        <div className="mt-5 pt-4 border-t border-psa-line">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
              Motivos de perda · {num(mScope.total)}{" "}
              <span className="text-psa-muted font-normal normal-case tracking-normal">· clique pra listar</span>
            </div>
            {showProposta && (
              // Legenda do split de proposta anexada (por motivo).
              <div className="flex items-center gap-3 text-[10px] text-psa-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: COM_FILL }} /> Com proposta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: SEM_FILL }} /> Sem proposta
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {mScope.reasons.map((r) => {
              const barW = (r.count / mMax) * 100; // magnitude do motivo
              if (!showProposta) {
                // B2C — motivo simples, clique lista todos os negócios do motivo.
                return (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => setOpen({ name: r.name, deals: r.deals })}
                    title={`${r.name}: ${num(r.count)}`}
                    className="group flex items-center gap-3 text-left"
                  >
                    <span className="text-[12px] text-psa-ink-soft truncate w-[40%] group-hover:text-psa-ink">{r.name}</span>
                    <span className="flex-1 h-2.5 rounded bg-psa-canvas overflow-hidden">
                      <span className="block h-full bg-psa-orange rounded" style={{ width: `${barW}%` }} />
                    </span>
                    <span className="text-[11px] text-psa-ink-soft tabular-nums w-[120px] text-right">
                      <b className="text-psa-ink">{num(r.count)}</b> · {pctND(r.count, mScope.total)}
                    </span>
                  </button>
                );
              }
              // B2B — segmentos e números clicáveis separadamente (com / sem proposta).
              return (
                <div key={r.name} className="group flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen({ name: r.name, deals: r.deals })}
                    title={`${r.name}: ${num(r.count)} · clique pra listar todos`}
                    className="text-[12px] text-psa-ink-soft truncate w-[40%] text-left group-hover:text-psa-ink"
                  >
                    {r.name}
                  </button>
                  <span className="flex-1 h-2.5 rounded bg-psa-canvas overflow-hidden flex">
                    {/* magnitude do motivo, dividida em com/sem proposta — cada parte clicável */}
                    <span className="flex h-full" style={{ width: `${barW}%` }}>
                      {r.com > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpen({ name: r.name, deals: r.deals })}
                          title={`${num(r.com)} com proposta anexada — clique pra listar`}
                          style={{ width: `${(r.com / r.count) * 100}%`, background: COM_FILL }}
                          className="h-full hover:opacity-80"
                        />
                      )}
                      {r.sem > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpen({ name: r.name, deals: r.deals })}
                          title={`${num(r.sem)} sem proposta anexada — clique pra listar`}
                          style={{ width: `${(r.sem / r.count) * 100}%`, background: SEM_FILL }}
                          className="h-full hover:opacity-80"
                        />
                      )}
                    </span>
                  </span>
                  <span className="text-[11px] tabular-nums w-[120px] text-right">
                    <b className="text-psa-ink">{num(r.count)}</b>{" "}
                    <span className="text-psa-muted">·</span>{" "}
                    {r.com > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOpen({ name: r.name, deals: r.deals })}
                        title="Listar com proposta anexada"
                        className="font-semibold hover:underline"
                        style={{ color: COM_FILL }}
                      >
                        {num(r.com)}
                      </button>
                    ) : (
                      <span style={{ color: COM_FILL }}>0</span>
                    )}
                    <span className="text-psa-muted">/</span>
                    {r.sem > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOpen({ name: r.name, deals: r.deals })}
                        title="Listar sem proposta anexada"
                        className="font-semibold hover:underline"
                        style={{ color: SEM_FILL }}
                      >
                        {num(r.sem)}
                      </button>
                    ) : (
                      <span style={{ color: SEM_FILL }}>0</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && <MotivosModal title={open.name} deals={open.deals} segmentar={!!showProposta} onClose={() => setOpen(null)} />}
    </div>
  );
}

type SortKey = "closer" | "negocio";

function MotivosModal({ title, deals, segmentar, onClose }: { title: string; deals: MotivosItem[]; segmentar: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<SortKey>("closer");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const sorted = [...deals].sort((a, b) =>
    sort === "closer"
      ? (a.closer || "").localeCompare(b.closer || "", "pt-BR") || a.dealname.localeCompare(b.dealname, "pt-BR")
      : a.dealname.localeCompare(b.dealname, "pt-BR")
  );

  // Um negócio da lista.
  const dealLi = (d: MotivosItem, i: number) => (
    <li key={i} className="text-[11px]">
      <a href={d.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2" title="Abrir negócio no HubSpot">
        <span className="flex-1 min-w-0 truncate text-white/75 group-hover:text-psa-orange group-hover:underline">{d.dealname}</span>
        <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
      </a>
    </li>
  );
  // Sub-bloco "Com proposta" / "Sem proposta" dentro da seção do closer.
  const sub = (label: string, color: string, items: MotivosItem[]) =>
    items.length === 0 ? null : (
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/55">
          <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: color }} />
          {label}
          <span className="text-white/35 font-normal normal-case">· {items.length}</span>
        </div>
        <ul className="mt-1 pl-3 border-l-2 space-y-1" style={{ borderColor: `${color}55` }}>
          {items.map(dealLi)}
        </ul>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold">{title}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {num(deals.length)} {deals.length === 1 ? "negócio perdido" : "negócios perdidos"}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Ordenação da lista */}
            <label className="flex items-center gap-1.5 text-[11px] text-white/60">
              Ordenar
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md bg-white/10 border border-white/15 px-2 py-1 text-[12px] text-white focus:outline-none"
              >
                <option value="closer">Closer</option>
                <option value="negocio">Negócio</option>
              </select>
            </label>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sort === "closer" ? (
            // Blocado por closer, no padrão do "Histórico de vendas".
            <div className="divide-y divide-white/10">
              {(() => {
                const groups = new Map<string, MotivosItem[]>();
                for (const d of deals) {
                  const name = d.closer || "Sem closer";
                  if (!groups.has(name)) groups.set(name, []);
                  groups.get(name)!.push(d);
                }
                return [...groups.entries()]
                  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"))
                  .map(([name, ds]) => {
                    const com = ds.filter((d) => d.comProposta);
                    const sem = ds.filter((d) => !d.comProposta);
                    return (
                      <div key={name} className="px-6 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold text-white/90 truncate">{name}</span>
                          <span className="text-[11px] text-white/60 whitespace-nowrap">
                            {ds.length} {ds.length === 1 ? "negócio" : "negócios"}
                          </span>
                        </div>
                        {segmentar ? (
                          <div className="mt-2 space-y-2.5">
                            {sub("Com proposta", COM_FILL, com)}
                            {sub("Sem proposta", SEM_FILL, sem)}
                          </div>
                        ) : (
                          <ul className="mt-1.5 pl-3 border-l-2 border-psa-orange/30 space-y-1">
                            {ds.map(dealLi)}
                          </ul>
                        )}
                      </div>
                    );
                  });
              })()}
            </div>
          ) : (
            <ol className="divide-y divide-white/10">
              {sorted.map((d, i) => (
                <li key={i} className="hover:bg-white/[0.03] transition-colors">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="group px-6 py-3 flex items-center gap-4" title="Abrir negócio no HubSpot">
                    <span className="text-xs font-mono text-white/40 tabular-nums w-8">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 min-w-0 text-sm text-white/90 truncate group-hover:text-psa-orange group-hover:underline">{d.dealname}</span>
                    <span className="shrink-0 text-[11px] text-white/50 truncate max-w-[160px]" title={d.closer}>{d.closer || "—"}</span>
                    <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
