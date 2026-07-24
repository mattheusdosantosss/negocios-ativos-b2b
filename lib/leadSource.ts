// Filtro de "Origem do Lead" (origem_do_lead no HubSpot), global aos dois
// segmentos. `values` são os valores REAIS do HubSpot; [] = sem filtro (Todas).

export type LeadSourceId = "all" | "inbound" | "palestrante" | "curador" | "carteira";

type LeadSource = { id: LeadSourceId; label: string; values: string[] };

export const LEAD_SOURCES: LeadSource[] = [
  { id: "all", label: "Todas", values: [] },
  { id: "inbound", label: "Inbound", values: ["Inbound"] },
  { id: "palestrante", label: "Palestrante", values: ["Palestrante"] },
  { id: "curador", label: "Curador", values: ["Curador"] },
  // No HubSpot o valor é "Carteira do Farmer" (rótulo "Carteira").
  { id: "carteira", label: "Carteira", values: ["Carteira do Farmer"] },
];

export const DEFAULT_LEAD_SOURCE: LeadSourceId = "all";

export function isLeadSourceId(v: string | null | undefined): v is LeadSourceId {
  return LEAD_SOURCES.some((s) => s.id === v);
}

/** Valores de origem_do_lead pro filtro; [] quando "Todas" (sem filtro). */
export function leadSourceValues(v?: string | null): string[] {
  return LEAD_SOURCES.find((s) => s.id === v)?.values ?? [];
}
