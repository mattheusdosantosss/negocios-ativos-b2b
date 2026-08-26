"use client";

import { useEffect, useState } from "react";
import type {
  ReunioesCloser,
  ReunioesMeetingItem,
  ReunioesOutcomeId,
  ReunioesPerfilData,
  ReunioesStatusId,
} from "@/lib/hubspot";

const num = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

// Resultado da reunião — padrão semáforo: Realizada verde, Agendada amarelo,
// Cancelada vermelho, No-show cinza escuro.
const OUTCOMES: { id: ReunioesOutcomeId; label: string; fill: string; text: string }[] = [
  { id: "realizada", label: "Realizada", fill: "#1E9E62", text: "#fff" },
  { id: "agendada", label: "Agendada", fill: "#E8A317", text: "#3A2A00" },
  { id: "cancelada", label: "Cancelada", fill: "#C0432F", text: "#fff" },
  { id: "noshow", label: "No-show", fill: "#4A4A4A", text: "#fff" },
];

const STATUS: { id: ReunioesStatusId | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativo", label: "Ativo" },
  { id: "ganho", label: "Ganho" },
  { id: "perdido", label: "Perdido" },
];
const ALL_STATUS: ReunioesStatusId[] = ["ativo", "ganho", "perdido"];

// Reuniões de um closer num status (todos = 3), perfil (null = todos) e resultado.
function collect(
  closer: ReunioesCloser,
  status: ReunioesStatusId | "todos",
  perfilId: string | null,
  perfilIds: string[],
  outcome: ReunioesOutcomeId
): ReunioesMeetingItem[] {
  const sts = status === "todos" ? ALL_STATUS : [status];
  const pids = perfilId ? [perfilId] : perfilIds;
  const out: ReunioesMeetingItem[] = [];
  for (const st of sts) for (const pid of pids) {
    const cell = closer.cube[st][pid];
    if (cell) out.push(...cell[outcome]);
  }
  return out;
}

type Sel = { closer: ReunioesCloser; perfilId: string | null; perfilLabel: string | null; outcome: ReunioesOutcomeId } | null;

type Props = { data: ReunioesPerfilData };

/**
 * Reuniões dos closers B2C (dono da reunião) em barras empilhadas por resultado
 * (Agendada/Realizada/Cancelada/No-show), no padrão do painel. Uma barra por
 * closer, expansível pro detalhe por perfil; seletor de status do negócio
 * (Todos/Ativo/Ganho/Perdido). Cada segmento abre o popup com os negócios.
 */
export default function ReunioesPerfilCard({ data }: Props) {
  const [status, setStatus] = useState<ReunioesStatusId | "todos">("todos");
  // Detalhe por perfil aberto por padrão (é a característica principal do card);
  // rastreamos só os recolhidos, então closer novo já entra aberto.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Sel>(null);
  const perfilIds = data.perfis.map((p) => p.id);

  const counts = (closer: ReunioesCloser, perfilId: string | null) =>
    OUTCOMES.map((o) => ({ o, n: collect(closer, status, perfilId, perfilIds, o.id).length }));
  const totalOf = (closer: ReunioesCloser, perfilId: string | null) =>
    counts(closer, perfilId).reduce((s, c) => s + c.n, 0);

  const teamTotal = data.closers.reduce((s, c) => s + totalOf(c, null), 0);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Barra empilhada. No nível do closer é só um resumo → fina, sutil, sem
  // número (o detalhe de verdade vem nas barras de perfil, essas cheias com
  // número, no padrão do card de temperatura).
  const Bar = ({ closer, perfilId, perfilLabel }: { closer: ReunioesCloser; perfilId: string | null; perfilLabel: string | null }) => {
    const cs = counts(closer, perfilId);
    const total = cs.reduce((s, c) => s + c.n, 0);
    const subtle = perfilId === null;
    const seg = (o: (typeof OUTCOMES)[number], n: number) =>
      n === 0 ? null : (
        <button
          key={o.id}
          type="button"
          onClick={() => setSel({ closer, perfilId, perfilLabel, outcome: o.id })}
          title={`${closer.nome}${perfilLabel ? ` · ${perfilLabel}` : ""} · ${o.label}: ${num(n)} — clique pra listar`}
          aria-label={`${o.label}: ${num(n)}`}
          className={
            subtle
              ? "rounded-full transition-opacity hover:opacity-60"
              : "flex items-center justify-center text-[11px] font-medium transition-opacity hover:opacity-85"
          }
          style={
            subtle
              ? { width: `${(n / total) * 100}%`, minWidth: 4, background: o.fill }
              : { width: `${(n / total) * 100}%`, background: o.fill, color: o.text }
          }
        >
          {subtle ? null : (n / total) * 100 >= 7 ? num(n) : ""}
        </button>
      );
    return (
      <div className={subtle ? "flex gap-[2px]" : "flex rounded-md overflow-hidden"} style={{ height: subtle ? 7 : 24 }}>
        {total === 0 ? <div className={`w-full bg-psa-canvas ${subtle ? "rounded-full" : ""}`} /> : cs.map(({ o, n }) => seg(o, n))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Reuniões por closer</div>
          <div className="mt-1 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(teamTotal)}</span>
            <span className="text-sm text-psa-ink-soft">reuniões · por data da reunião no período</span>
          </div>
          <div className="mt-1 text-[11px] text-psa-muted">
            Reuniões dos closers B2C · clique no closer pra abrir o detalhe por perfil · clique numa barra pra listar os negócios
          </div>
        </div>

        {/* Seletor de status do negócio */}
        <div className="flex rounded-xl bg-psa-canvas border border-psa-line p-1">
          {STATUS.map((s) => {
            const active = s.id === status;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatus(s.id)}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all ${
                  active ? "bg-psa-orange text-white shadow" : "text-psa-ink-soft hover:text-psa-ink"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {OUTCOMES.map((o) => (
          <span key={o.id} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: o.fill }} />
            {o.label}
          </span>
        ))}
      </div>

      {/* Barras por closer */}
      <div className="mt-4 space-y-4">
        {data.closers.map((c) => {
          const total = totalOf(c, null);
          const realizada = counts(c, null).find((x) => x.o.id === "realizada")?.n ?? 0;
          const isOpen = !collapsed.has(c.ownerId);
          return (
            <div key={c.ownerId}>
              <div className="flex justify-between items-baseline mb-1.5 gap-2">
                <button
                  type="button"
                  onClick={() => toggle(c.ownerId)}
                  title={isOpen ? "Recolher detalhe por perfil" : "Abrir detalhe por perfil"}
                  className="group text-left text-[13px] font-medium text-psa-ink inline-flex items-center gap-2"
                >
                  <span className={`text-psa-orange text-[10px] leading-none transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}>▼</span>
                  <span className="group-hover:underline underline-offset-2 decoration-psa-orange/50">{c.nome}</span>{" "}
                  <span className="text-psa-ink-soft font-normal">{num(total)} reuniões</span>
                </button>
                <span className="text-[11px] text-psa-ink-soft whitespace-nowrap">
                  realizada <b className="text-psa-ink">{total > 0 ? ((realizada / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0"}%</b>
                </span>
              </div>
              {isOpen && <Bar closer={c} perfilId={null} perfilLabel={null} />}

              {isOpen && (
                <div className="mt-3 pl-4 space-y-3">
                  {data.perfis.map((p) => {
                    const t = totalOf(c, p.id);
                    if (t === 0) return null;
                    return (
                      <div key={p.id}>
                        <div className="flex justify-between items-baseline mb-1 gap-2">
                          <span className="text-[13px] font-medium text-psa-ink">
                            {p.label} <span className="text-psa-ink-soft font-normal">{num(t)}</span>
                          </span>
                        </div>
                        <Bar closer={c} perfilId={p.id} perfilLabel={p.label} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sel && (
        <ReunioesModal
          items={collect(sel.closer, status, sel.perfilId, perfilIds, sel.outcome)}
          title={`${sel.closer.nome}${sel.perfilLabel ? ` · ${sel.perfilLabel}` : ""} · ${OUTCOMES.find((o) => o.id === sel.outcome)!.label}`}
          statusLabel={STATUS.find((s) => s.id === status)!.label}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

function ReunioesModal({ items, title, statusLabel, onClose }: { items: ReunioesMeetingItem[]; title: string; statusLabel: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Uma reunião por linha, agrupada por negócio (um negócio pode ter várias).
  const byDeal = new Map<string, { dealname: string; url: string; amount: number; dates: string[] }>();
  for (const it of items) {
    const g = byDeal.get(it.dealId) ?? { dealname: it.dealname, url: it.url, amount: it.amount, dates: [] };
    if (it.date) g.dates.push(it.date);
    byDeal.set(it.dealId, g);
  }
  const groups = [...byDeal.values()].sort((a, b) => b.amount - a.amount);
  const valorTotal = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold truncate">{title}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {num(items.length)} {items.length === 1 ? "reunião" : "reuniões"} · {num(groups.length)}{" "}
              {groups.length === 1 ? "negócio" : "negócios"} · status {statusLabel}
            </div>
            <div className="mt-1 text-[11px] text-white/50">
              Valor dos negócios (bruto): <span className="text-white/75 font-medium">{brl(valorTotal)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhuma reunião encontrada.</div>
          ) : (
            <ul className="divide-y divide-white/10">
              {groups.map((g, i) => (
                <li key={i} className="px-6 py-2.5">
                  <a href={g.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 text-[12px]" title="Abrir negócio no HubSpot">
                    <span className="flex-1 min-w-0 truncate text-white/80 group-hover:text-psa-orange group-hover:underline">
                      {g.dealname}
                      {g.dates.length > 1 && <span className="text-white/40"> · {g.dates.length} reuniões</span>}
                    </span>
                    <span className="shrink-0 flex items-center gap-3">
                      <span className="text-white/45 tabular-nums" title="Data da reunião">{fmtDate(g.dates.sort().at(-1))}</span>
                      <span className="text-psa-orange tabular-nums whitespace-nowrap">{brl(g.amount)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
