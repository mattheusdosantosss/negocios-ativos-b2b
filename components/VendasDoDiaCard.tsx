"use client";

import type { VendasDoDiaData, VendaItem } from "@/lib/vendasDia";

const fmtK = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k` : `R$ ${n.toLocaleString("pt-BR")}`;
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

const SEG = {
  b2b: { badge: "bg-psa-blue/10 text-psa-blue", value: "text-psa-blue", card: "bg-psa-blue/[0.04] border-psa-blue/15" },
  b2c: { badge: "bg-psa-orange/10 text-psa-orange", value: "text-psa-orange", card: "bg-psa-orange/[0.05] border-psa-orange/15" },
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
      className={`block rounded-xl border ${s.card} p-3 hover:shadow-card transition-shadow`}
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
            <span key={i} className="text-[10px] text-psa-ink-soft bg-psa-canvas rounded px-1.5 py-0.5 truncate max-w-full">{t}</span>
          ))}
          {v.palestrante && (
            <span className="text-[10px] font-medium text-psa-blue bg-psa-blue/10 rounded px-1.5 py-0.5 truncate max-w-full">{v.palestrante}</span>
          )}
        </div>
      )}
    </a>
  );
}

export default function VendasDoDiaCard({ data }: { data: VendasDoDiaData }) {
  return (
    <div className="rounded-2xl bg-psa-surface border border-psa-line shadow-card overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-psa-ink-soft">Vendas do dia</div>
      </div>
      <div className="max-h-[560px] overflow-y-auto px-5 pb-5">
        {data.dias.length === 0 ? (
          <div className="py-10 text-center text-sm text-psa-ink-soft">Nenhuma venda no período.</div>
        ) : (
          data.dias.map((dia) => (
            <div key={dia.key} className="pt-4 first:pt-1">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[13px] font-semibold text-psa-ink">{dayLabel(dia.key)}</span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2.5 py-1 whitespace-nowrap">
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
