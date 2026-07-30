"use client";

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%");
const num = (n: number) => n.toLocaleString("pt-BR");

type Props = { data: { total: number; alguma: number; realizada: number } };

// realizada (verde) | marcada não realizada (âmbar) | sem reunião (cinza)
const SEG = {
  realizada: { fill: "#1E9E62", text: "#fff", label: "Reunião realizada" },
  agendada: { fill: "#E8A317", text: "#3A2A00", label: "Reunião marcada, não realizada" },
  sem: { fill: "#E8E5E1", text: "#806D61", label: "Sem reunião" },
};

export default function PropostaMeetingCard({ data }: Props) {
  const { total, alguma, realizada } = data;
  const agendada = Math.max(0, alguma - realizada);
  const sem = Math.max(0, total - alguma);
  const w = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <div className="flex items-baseline gap-6 flex-wrap mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Reunião realizada</div>
          <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{pct(realizada, total)}</span>
        </div>
        <div className="text-sm text-psa-ink-soft">
          <b className="text-psa-ink">{num(realizada)}</b> realizaram reunião ·{" "}
          <b className="text-psa-ink">{pct(alguma, total)}</b> ({num(alguma)}) chegaram a marcar reunião (realizada ou não) ·{" "}
          <span className="text-psa-muted">de {num(total)} com proposta anexada</span>
        </div>
      </div>

      {/* legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
        {Object.values(SEG).map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: s.fill }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
        {total === 0 ? (
          <div className="w-full bg-psa-canvas" />
        ) : (
          [
            { k: "realizada", v: realizada, ...SEG.realizada },
            { k: "agendada", v: agendada, ...SEG.agendada },
            { k: "sem", v: sem, ...SEG.sem },
          ].map((s) =>
            s.v === 0 ? null : (
              <div
                key={s.k}
                className="flex items-center justify-center text-[11px] font-medium"
                style={{ width: `${w(s.v)}%`, background: s.fill, color: s.text }}
                title={`${s.label}: ${num(s.v)}`}
              >
                {w(s.v) >= 7 ? num(s.v) : ""}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
