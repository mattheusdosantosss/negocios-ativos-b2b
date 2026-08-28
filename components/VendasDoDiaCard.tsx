"use client";

import type { VendasDoDiaData, VendaItem } from "@/lib/vendasDia";

const num = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtK = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k` : `R$ ${num(n)}`;
const fmtDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// Rótulo do dia: "Quinta-Feira, 27 De Agosto", com "Hoje ·"/"Ontem ·" relativo.
function dayLabel(key: string): string {
  const d = new Date(key + "T12:00:00");
  const base = titleCase(d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }));
  const today = new Date();
  const k = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (key === k(today)) return `Hoje · ${base}`;
  if (key === k(yest)) return `Ontem · ${base}`;
  return base;
}

// Pipeline: badge + cor do valor (B2B azul, B2C laranja — identidade PSA).
const SEG = {
  b2b: { badge: "bg-psa-blue/10 text-psa-blue", value: "text-psa-blue" },
  b2c: { badge: "bg-psa-orange/10 text-psa-orange", value: "text-psa-orange" },
} as const;

function Venda({ v }: { v: VendaItem }) {
  const s = SEG[v.seg];
  const tags: string[] = [];
  if (v.evento) tags.push(`Evento ${fmtDate(v.evento)}`);
  if (v.produto) tags.push(v.produto);
  if (v.turma) tags.push(`Turma ${v.turma}`);
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-psa-line bg-psa-canvas/40 p-3 hover:border-psa-orange/40 hover:bg-psa-canvas/70 transition-colors"
      title="Abrir negócio no HubSpot"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${s.badge}`}>{v.seg}</span>
        <span className={`text-sm font-bold tabular-nums ${s.value}`}>{fmtK(v.amount)}</span>
        <span className="text-[12px] text-psa-muted truncate">{v.closer}</span>
      </div>
      <div className="mt-1.5 text-[13px] font-medium text-psa-ink truncate">{v.dealname}</div>
      {v.sdrFarmer && (
        <div className="mt-0.5 text-[11px] text-psa-ink-soft">
          SDR/Farmer: <b className="text-psa-ink font-medium">{v.sdrFarmer}</b>
        </div>
      )}
      {(tags.length > 0 || v.palestrante) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className="text-[10px] text-psa-ink-soft bg-psa-surface border border-psa-line rounded px-1.5 py-0.5 truncate max-w-full">{t}</span>
          ))}
          {v.palestrante && (
            <span className="text-[10px] font-medium text-psa-orange bg-psa-orange/10 rounded px-1.5 py-0.5 truncate max-w-full">🎤 {v.palestrante}</span>
          )}
        </div>
      )}
    </a>
  );
}

export default function VendasDoDiaCard({ data }: { data: VendasDoDiaData }) {
  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
      {/* Cabeçalho no padrão do painel */}
      <div className="px-5 pt-5 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-psa-ink-soft">Vendas do dia</div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-4xl font-extrabold text-psa-orange tabular-nums">{num(data.count)}</span>
          <span className="text-sm text-psa-ink-soft">
            {data.count === 1 ? "venda" : "vendas"} · <b className="text-psa-ink">{brl(data.total)}</b> no período
          </span>
        </div>
        <div className="mt-1 text-[11px] text-psa-muted">Ganhos B2B e B2C por dia · role pra ver os dias anteriores · clique pra abrir</div>
      </div>

      <div className="max-h-[560px] overflow-y-auto px-5 pb-5 border-t border-psa-line">
        {data.dias.length === 0 ? (
          <div className="py-10 text-center text-sm text-psa-ink-soft">Nenhuma venda no período.</div>
        ) : (
          data.dias.map((dia) => (
            <div key={dia.key} className="pt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[12px] font-semibold text-psa-ink">{dayLabel(dia.key)}</span>
                <span className="text-[11px] font-semibold text-psa-orange bg-psa-orange/10 rounded-full px-2.5 py-1 whitespace-nowrap">
                  {dia.count} {dia.count === 1 ? "venda" : "vendas"} · {fmtK(dia.total)}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dia.vendas.map((v, i) => (
                  <Venda key={i} v={v} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
