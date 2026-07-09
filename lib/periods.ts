// Presets de período pro filtro por Data de criação do negócio.
// "all" (padrão) = sem filtro de data, mostra o snapshot completo de
// negócios ativos, igual ao comportamento original do painel.

export type PeriodPreset = "all" | "today" | "this_month" | "last_month" | "7d" | "30d" | "custom";

export type PeriodValue = {
  preset: PeriodPreset;
  from: string;
  to: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function computePeriod(preset: PeriodPreset, fallback?: { from: string; to: string }): PeriodValue {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  switch (preset) {
    case "all":
      return { preset, from: "", to: "" };
    case "today":
      return { preset, from: fmt(today), to: fmt(today) };
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { preset, from: fmt(first), to: fmt(today) };
    }
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { preset, from: fmt(first), to: fmt(last) };
    }
    case "7d":
      return { preset, from: fmt(daysAgo(6)), to: fmt(today) };
    case "30d":
      return { preset, from: fmt(daysAgo(29)), to: fmt(today) };
    case "custom":
      return {
        preset,
        from: fallback?.from || fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: fallback?.to || fmt(today),
      };
  }
}

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  all: "Todo o período",
  today: "Hoje",
  this_month: "Este mês",
  last_month: "Mês passado",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  custom: "Período personalizado",
};

export const PRESET_OPTIONS: PeriodPreset[] = [
  "all",
  "today",
  "this_month",
  "last_month",
  "7d",
  "30d",
  "custom",
];

// Formata "01/05 — 26/05" pra mostrar embaixo do filtro
export function formatPeriodRange(from: string, to: string): string {
  const f = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  return `${f(from)} — ${f(to)}`;
}
