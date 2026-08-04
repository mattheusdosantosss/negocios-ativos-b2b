"use client";

import { useEffect, useState } from "react";
import type { PropostaMeetingData, PropostaMeetingItem } from "@/lib/hubspot";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%");
const num = (n: number) => n.toLocaleString("pt-BR");
const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const t = new Date(iso);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("pt-BR") : "—";
};

// Origem da reunião (hs_meeting_source) → rótulo amigável.
const SOURCE_LABEL: Record<string, string> = {
  CRM_UI: "CRM (manual)",
  BIDIRECTIONAL_SYNC: "Sync de calendário",
  BIDIRECTIONAL_API: "Integração (API)",
  MEETINGS_TOOL: "Link de agendamento",
  INTEGRATION: "Integração",
};
const srcLabel = (s?: string) => (s ? SOURCE_LABEL[s] ?? s : "—");

// Resultado da reunião (hs_meeting_outcome) → rótulo.
const OUTCOME_LABEL: Record<string, string> = {
  COMPLETED: "Realizada",
  SCHEDULED: "Agendada",
  NO_SHOW: "No-show",
  CANCELED: "Cancelada",
  RESCHEDULED: "Remarcada",
};
const outLabel = (o?: string) => (o ? OUTCOME_LABEL[o] ?? o : "Sem registro");
// Cor do resultado (pill no modal escuro).
const outStyle = (o?: string): string => {
  if (o === "COMPLETED") return "bg-[#1E9E62] text-white";
  if (o === "NO_SHOW" || o === "CANCELED") return "bg-[#C0432F] text-white";
  if (o) return "bg-[#E8A317] text-[#3A2A00]";
  return "bg-white/10 text-white/60";
};

type Bucket = "realizada" | "agendada" | "sem";
const SEG: Record<Bucket, { fill: string; text: string; label: string }> = {
  realizada: { fill: "#1E9E62", text: "#fff", label: "Reunião realizada" },
  agendada: { fill: "#E8A317", text: "#3A2A00", label: "Reunião marcada, não realizada" },
  sem: { fill: "#E8E5E1", text: "#806D61", label: "Sem reunião" },
};

type Props = { data: PropostaMeetingData };

export default function PropostaMeetingCard({ data }: Props) {
  const [open, setOpen] = useState<Bucket | null>(null);
  const [month, setMonth] = useState<string>("all");

  // Filtro "exclusivo" do card: recorta as listas por mês de envio da proposta
  // (client-side, sem refetch) — igual ao "Mês de fechamento" da conversão.
  const inMonth = (it: PropostaMeetingItem) => month === "all" || it.monthKey === month;
  const filtered: Record<Bucket, PropostaMeetingItem[]> = {
    realizada: data.deals.realizada.filter(inMonth),
    agendada: data.deals.agendada.filter(inMonth),
    sem: data.deals.sem.filter(inMonth),
  };
  const counts: Record<Bucket, number> = {
    realizada: filtered.realizada.length,
    agendada: filtered.agendada.length,
    sem: filtered.sem.length,
  };
  const realizada = counts.realizada;
  const agendada = counts.agendada;
  const sem = counts.sem;
  const total = realizada + agendada + sem;
  const w = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-6 flex-wrap mb-4">
        <div className="flex items-baseline gap-6 flex-wrap min-w-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Reunião realizada</div>
            <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(realizada, total)}</span>
          </div>
          <p className="text-sm text-psa-ink-soft max-w-[70ch] m-0">
            De <b className="text-psa-ink">{num(total)}</b> negócios com proposta enviada,{" "}
            <b className="text-psa-ink">{num(realizada)}</b> realizaram uma reunião e outros{" "}
            <b className="text-psa-ink">{num(agendada)}</b> chegaram a marcar mas não há registro de conclusão.{" "}
            <b className="text-psa-ink">{num(sem)}</b> não têm nenhuma reunião.
          </p>
        </div>

        <div className="flex flex-col shrink-0">
          <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-psa-ink-soft">Mês de envio</label>
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
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
        {(Object.keys(SEG) as Bucket[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: SEG[k].fill }} />
            {SEG[k].label}
          </span>
        ))}
      </div>

      <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
        {total === 0 ? (
          <div className="w-full bg-psa-canvas" />
        ) : (
          (Object.keys(SEG) as Bucket[]).map((k) => {
            const v = counts[k];
            if (v === 0) return null;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setOpen(k)}
                title={`${SEG[k].label}: ${num(v)} · clique pra listar`}
                className="flex items-center justify-center text-[11px] font-medium transition-opacity hover:opacity-85"
                style={{ width: `${w(v)}%`, background: SEG[k].fill, color: SEG[k].text }}
              >
                {w(v) >= 7 ? num(v) : ""}
              </button>
            );
          })
        )}
      </div>

      {open && (
        <MeetingModal
          title={SEG[open].label}
          items={filtered[open]}
          showMeeting={open !== "sem"}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function MeetingModal({
  title,
  items,
  showMeeting,
  onClose,
}: {
  title: string;
  items: PropostaMeetingItem[];
  showMeeting: boolean;
  onClose: () => void;
}) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold">{title}</h3>
            <div className="mt-1 text-xs text-psa-orange font-semibold uppercase tracking-wider">
              {num(items.length)} {items.length === 1 ? "negócio" : "negócios"} com proposta enviada
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/60">Nenhum negócio.</div>
          ) : (
            <ol className="divide-y divide-white/10">
              {items.map((it, i) => {
                const content = (
                  <>
                    <span className="text-xs font-mono text-white/40 tabular-nums w-8">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm text-white/90 truncate ${it.url ? "group-hover:text-psa-orange group-hover:underline" : ""}`}>
                        {it.dealname}
                      </div>
                      {showMeeting && (
                        <div className="mt-0.5 text-[11px] text-white/50 truncate">
                          {it.meetingTitle || "Reunião"} · {fmtDate(it.meetingDate)} · {srcLabel(it.source)}
                        </div>
                      )}
                    </div>
                    {it.url && <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>}
                    {showMeeting && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap ${outStyle(it.outcome)}`}>
                        {outLabel(it.outcome)}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={i} className="hover:bg-white/[0.03] transition-colors">
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="group px-6 py-3 flex items-center gap-4" title="Abrir negócio no HubSpot">
                        {content}
                      </a>
                    ) : (
                      <div className="group px-6 py-3 flex items-center gap-4">{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
