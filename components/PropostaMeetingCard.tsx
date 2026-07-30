"use client";

import { useState } from "react";
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

type Bucket = "realizada" | "agendada" | "sem";
const SEG: Record<Bucket, { fill: string; text: string; label: string }> = {
  realizada: { fill: "#1E9E62", text: "#fff", label: "Reunião realizada" },
  agendada: { fill: "#E8A317", text: "#3A2A00", label: "Reunião marcada, não realizada" },
  sem: { fill: "#E8E5E1", text: "#806D61", label: "Sem reunião" },
};

type Props = { data: PropostaMeetingData };

export default function PropostaMeetingCard({ data }: Props) {
  const [open, setOpen] = useState<Bucket | null>(null);
  const { total, realizada, alguma } = data;
  const agendada = Math.max(0, alguma - realizada);
  const sem = Math.max(0, total - alguma);
  const w = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const counts: Record<Bucket, number> = { realizada, agendada, sem };

  return (
    <div>
      <div className="flex items-baseline gap-6 flex-wrap mb-4">
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
          items={data.deals[open]}
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-psa-surface rounded-2xl shadow-card w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-psa-line">
          <div>
            <div className="font-display text-sm font-semibold text-psa-ink">{title}</div>
            <div className="text-[11px] text-psa-ink-soft">{num(items.length)} negócios com proposta enviada</div>
          </div>
          <button type="button" onClick={onClose} className="text-psa-ink-soft hover:text-psa-ink text-lg leading-none px-2">
            ×
          </button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-psa-canvas text-psa-ink-soft">
              <tr className="text-left">
                <th className="px-5 py-2 font-semibold">Negócio</th>
                {showMeeting && <th className="px-3 py-2 font-semibold">Reunião</th>}
                {showMeeting && <th className="px-3 py-2 font-semibold">Origem</th>}
                {showMeeting && <th className="px-3 py-2 font-semibold">Resultado</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-psa-line align-top">
                  <td className="px-5 py-2">
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" className="text-psa-blue hover:underline">
                        {it.dealname}
                      </a>
                    ) : (
                      it.dealname
                    )}
                  </td>
                  {showMeeting && (
                    <td className="px-3 py-2 text-psa-ink-soft">
                      {it.meetingTitle || "Reunião"}
                      <span className="text-psa-muted"> · {fmtDate(it.meetingDate)}</span>
                    </td>
                  )}
                  {showMeeting && <td className="px-3 py-2 text-psa-ink-soft">{srcLabel(it.source)}</td>}
                  {showMeeting && <td className="px-3 py-2 text-psa-ink-soft">{outLabel(it.outcome)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
