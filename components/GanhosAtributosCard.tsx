"use client";

import { useState } from "react";
import type { GanhosAtributosData, GanhoBucket } from "@/lib/b2cCards";
import DealListModal from "./DealListModal";

const num = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

type Style = Record<string, { fill: string; text: string }>;
const SEM_DADO = { fill: "#E4E1DA", text: "#7A756B" };
const PERFIL: Style = {
  escala: { fill: "#7A3FF2", text: "#fff" },
  profissionalize: { fill: "#0E8C8B", text: "#fff" },
  iniciante: { fill: "#E8A317", text: "#3A2A00" },
  sem_perfil: SEM_DADO,
};
const TEMP: Style = {
  vou_vender: { fill: "#FF640F", text: "#fff" },
  forecast: { fill: "#053CAA", text: "#fff" },
  cafe: { fill: "#D9C2A3", text: "#4A3B27" },
  larguei: { fill: "#4A4A4A", text: "#fff" },
  sem_leitura: SEM_DADO,
};
const SCORE: Style = {
  "0_25": { fill: "#FAD3B8", text: "#7A3B10" },
  "26_50": { fill: "#F3A469", text: "#5A2A08" },
  "51_75": { fill: "#EE7A38", text: "#fff" },
  "76_100": { fill: "#C7460F", text: "#fff" },
  sem_nota: SEM_DADO,
};

type Sel = { label: string; deals: GanhoBucket["deals"] } | null;

/**
 * Seção "Ganhos por atributo" — 3 barras (perfil / temperatura / lead score),
 * embutida no card de Taxa de conversão (detalha o lado dos ganhos). Sem card
 * wrapper: quem envolve é o ConversionCard.
 */
export default function GanhosAtributosCard({ data }: { data: GanhosAtributosData }) {
  const [sel, setSel] = useState<Sel>(null);

  const Bloco = ({ titulo, cobertura, buckets, style }: { titulo: string; cobertura: number; buckets: GanhoBucket[]; style: Style }) => {
    const total = buckets.reduce((s, b) => s + b.count, 0);
    return (
      <div>
        <div className="flex justify-between items-baseline mb-1.5 gap-2">
          <span className="text-[13px] font-medium text-psa-ink">{titulo}</span>
          <span className="text-[11px] text-psa-muted">cobertura <b className="text-psa-ink-soft">{pct(cobertura)}</b></span>
        </div>
        <div className="flex rounded-md overflow-hidden" style={{ height: 26 }}>
          {total === 0 ? (
            <div className="w-full bg-psa-canvas" />
          ) : (
            buckets.map((b) => {
              if (b.count === 0) return null;
              const w = (b.count / total) * 100;
              const st = style[b.id] ?? SEM_DADO;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSel({ label: `${titulo} · ${b.label}`, deals: b.deals })}
                  title={`${b.label}: ${num(b.count)} — clique pra listar`}
                  className="flex items-center justify-center text-[11px] font-medium transition-opacity hover:opacity-85"
                  style={{ width: `${w}%`, background: st.fill, color: st.text }}
                >
                  {w >= 7 ? num(b.count) : ""}
                </button>
              );
            })
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {buckets.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 text-[10px] text-psa-ink-soft">
              <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: (style[b.id] ?? SEM_DADO).fill }} />
              {b.label} <b className="text-psa-ink tabular-nums">{num(b.count)}</b>
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5 pt-4 border-t border-psa-line">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">
        Ganhos por atributo · {num(data.total)}{" "}
        <span className="text-psa-muted font-normal normal-case tracking-normal">· cinza = sem dado · clique pra listar</span>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        <Bloco titulo="Por perfil" cobertura={data.cobertura.perfil} buckets={data.porPerfil} style={PERFIL} />
        <Bloco titulo="Por temperatura" cobertura={data.cobertura.temperatura} buckets={data.porTemperatura} style={TEMP} />
        <Bloco titulo="Por lead score" cobertura={data.cobertura.leadScore} buckets={data.porLeadScore} style={SCORE} />
      </div>

      <DealListModal
        open={sel !== null}
        onClose={() => setSel(null)}
        stageLabel={sel?.label ?? ""}
        deals={sel?.deals ?? []}
        dateField="closedate"
      />
    </div>
  );
}
