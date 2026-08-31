"use client";

import { useEffect, useState } from "react";
import type { Cards4, Cards4Bucket, DealLite } from "@/lib/farmer/aggregate";

const num = (n: number) => n.toLocaleString("pt-BR");
const pctTxt = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "0%");
// Empresas únicas GLOBAIS do bucket (duas demandas da mesma empresa = 1).
const empCount = (ds: DealLite[]) =>
  new Set(ds.filter((d) => d.companyId).map((d) => d.companyId)).size + ds.filter((d) => !d.companyId).length;
// B2C é pessoa física (sem empresa) → conta negócios, não empresas únicas.
const cardCount = (key: Cards4Bucket, ds: DealLite[]) => (key === "b2c" ? ds.length : empCount(ds));
const idade = (iso?: string) => {
  const t = Date.parse(iso || "");
  return Number.isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86_400_000);
};

function Donut({ frac, color }: { frac: number; color: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, frac)));
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-psa-line" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 26 26)" />
    </svg>
  );
}

type CardDef = { key: Cards4Bucket; label: string; sub: string; color: string; badge: string; accent: string };
const CARDS: CardDef[] = [
  { key: "carteira", label: "Carteira do Farmer", sub: "empresas únicas", color: "#1E9E62", badge: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500" },
  { key: "acaoCrm", label: "Ação de CRM", sub: "prospecção ativa", color: "#FF640F", badge: "bg-psa-orange/15 text-psa-orange", accent: "bg-psa-orange" },
  { key: "b2c", label: "Convertido B2C", sub: "closer B2C atribuído", color: "#2563EB", badge: "bg-psa-blue/15 text-psa-blue", accent: "bg-psa-blue" },
  { key: "criador", label: "Com Criador", sub: "criado e sem repasse", color: "#DC2626", badge: "bg-red-100 text-red-700", accent: "bg-red-500" },
];

export default function Cards4Row({ data, loading }: { data: Cards4 | null; loading?: boolean }) {
  const [modal, setModal] = useState<CardDef | null>(null);
  const total = data ? CARDS.reduce((s, c) => s + cardCount(c.key, data.deals[c.key]), 0) : 0;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((cd) => {
        const value = data ? cardCount(cd.key, data.deals[cd.key]) : 0;
        const clickable = !!data && data.deals[cd.key].length > 0;
        return (
          <div
            key={cd.key}
            onClick={clickable ? () => setModal(cd) : undefined}
            className={`relative overflow-hidden rounded-2xl bg-psa-surface border border-psa-line p-5 shadow-card ${clickable ? "cursor-pointer hover:shadow-card-hover transition-shadow" : ""}`}
            title={clickable ? "Clique pra listar os negócios" : undefined}
          >
            <span className={`absolute left-0 top-0 h-full w-1 ${cd.accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-psa-ink-soft">{cd.label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold text-psa-ink tabular-nums">{loading ? "—" : num(value)}</span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${cd.badge}`}>{pctTxt(value, total)}</span>
                </div>
                <div className="mt-1 text-[11px] text-psa-muted">{cd.sub}</div>
                {cd.key === "criador" && data && data.criadorCriticos > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    {data.criadorCriticos} críticos (&gt;3d)
                  </div>
                )}
              </div>
              <Donut frac={total > 0 ? value / total : 0} color={cd.color} />
            </div>
          </div>
        );
      })}

      {modal && data && <CardModal cd={modal} deals={data.deals[modal.key]} empresas={empCount(data.deals[modal.key])} onClose={() => setModal(null)} />}
      {/* empresas só é exibido pra buckets com empresa; B2C mostra só negócios (ver CardModal) */}
    </section>
  );
}

function CardModal({ cd, deals, empresas, onClose }: { cd: CardDef; deals: DealLite[]; empresas: number; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [onClose]);
  const isCriador = cd.key === "criador";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] bg-psa-ink text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold inline-flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: cd.color }} /> {cd.label}
            </h3>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wider" style={{ color: cd.color }}>
              {cd.key !== "b2c" && <>{num(empresas)} {empresas === 1 ? "empresa" : "empresas"} · </>}
              {num(deals.length)} {deals.length === 1 ? "negócio" : "negócios"}
              {isCriador ? ` · sem repasse` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2 -mt-1" aria-label="Fechar">×</button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/10">
          {deals.map((d, i) => {
            const dias = idade(d.createdate);
            const critico = isCriador && dias > 3;
            return (
              <a key={i} href={`https://app.hubspot.com/contacts/49656171/record/0-3/${d.id}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 px-6 py-3 hover:bg-white/[0.03]">
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-white/90 group-hover:text-psa-orange">{d.dealname}</span>
                  <span className="block text-[11px] text-white/45 truncate">{d.companyName || "Sem empresa"}{d.stage ? ` · ${d.stage}` : ""}</span>
                </span>
                {isCriador && (
                  <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${critico ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/60"}`}>{dias}d</span>
                )}
                <span className="text-white/30 group-hover:text-psa-orange text-xs">↗</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
