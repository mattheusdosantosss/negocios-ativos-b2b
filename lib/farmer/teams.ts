// ============================================================
// Squads de farmers — fonte da verdade do painel dos líderes táticos
// ============================================================
//
// Mexe AQUI quando entrar/sair farmer. E-mail é case-insensitive,
// mas mantenha em minúsculas pra consistência.
//
// Quem não estiver nesta lista NÃO aparece no painel, mesmo que tenha
// deals no HubSpot. É proposital: filtro estrito por time. As listas
// espelham o dashboard de farmers (psa-farmer) — mantenha em sincronia.

export type SquadId = "leticia" | "katyeli" | "daniel" | "camila";

/** Valor de aba: "all" (visão geral) ou uma squad específica. */
export type TabValue = "all" | SquadId;

export type Squad = {
  id: SquadId;
  label: string;
  leader: string;
  members: string[]; // e-mails normalizados (lowercase)
};

export const SQUADS: Squad[] = [
  {
    id: "leticia",
    label: "Squad Leticia",
    leader: "Letícia",
    members: [
      "leonardo.machado@profissionaissa.com", // Leonardo Bitencourt Machado
      "juliano.marques@profissionaissa.com", // Juliano Machado Marques
      "samuel.oliveira@profissionaissa.com", // Samuel Marques Brião de Oliveira
    ],
  },
  {
    id: "katyeli",
    label: "Squad Katyeli",
    leader: "Katyeli",
    members: [
      "francielle.sotoriva@profissionaissa.com", // Francielle Sotoriva Inacio
      "gisele.santos@profissionaissa.com", // Gisele Beatriz Santos dos Santos
      "thaina.malta@profissionaissa.com", // Thaina Malta
      "rafael.brack@profissionaissa.com", // Rafael Rodrigues Brack da Silva
      "bruna.saraiva@profissionaissa.com", // Bruna Halfen Saraiva
      "francielle.lenz@profissionaissa.com", // Francielle Teles Lenz
    ],
  },
  {
    id: "daniel",
    label: "Squad Daniel",
    leader: "Daniel",
    members: [
      "andrei.mello@profissionaissa.com", // Andrei Felippe Freitas de Mello
      "gustavo.pacheco@profissionaissa.com", // Gustavo Stivanin Pacheco
      "maria.guimaraes@profissionaissa.com", // Maria Eduarda Porto Guimaraes
      "thiago.souza@profissionaissa.com", // Thiago Berto Souza
      "nathalia.pereira@profissionaissa.com", // Nathalia Pereira
      "joao.backmann@profissionaissa.com", // João Lucas Backmann
    ],
  },
  {
    id: "camila",
    label: "Squad Camila",
    leader: "Camila",
    members: [
      "jhuly.carvalho@profissionaissa.com", // Jhuly Correa de Carvalho
      "maria.azevedo@profissionaissa.com", // Maria Julia Heredia Beck de Azevedo
      "vitoria.schaeffer@profissionaissa.com", // Vitoria Garcia Schaeffer
      "hans.lopes@profissionaissa.com", // Hans Kelton Sales Lopes
      "rhayssa.wolkmer@profissionaissa.com", // Rhayssa de Almeida Wolkmer
      "luiza.rodriguez@profissionaissa.com", // Luiza Teixeira Basteiro Rodriguez
    ],
  },
];

// Conjunto de TODOS os e-mails permitidos (achatado, em lowercase)
export const ALL_FARMER_EMAILS: Set<string> = new Set(
  SQUADS.flatMap((s) => s.members.map((e) => e.toLowerCase()))
);

// Mapa rápido: email -> squadId (pra agrupar deals)
export const EMAIL_TO_SQUAD: Map<string, SquadId> = new Map(
  SQUADS.flatMap((s) => s.members.map((e) => [e.toLowerCase(), s.id] as const))
);

export function normalizeEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

export function squadOf(email?: string | null): SquadId | null {
  return EMAIL_TO_SQUAD.get(normalizeEmail(email)) ?? null;
}

// ============================================================
// Resolução de farmers — base (teams.ts) + overrides (KV)
// ============================================================

import type { Owner } from "./hubspot";

// Override de farmer (antes vinha do Vercel KV/admin). Nesta versão do painel
// não há admin: os overrides são sempre vazios e o time vem só do teams.ts.
export type FarmerOverride = { squadId: SquadId; hidden?: boolean };

export type ResolvedFarmer = {
  ownerId: string;
  email: string;
  nome: string;
  squadId: SquadId;
  /** "base" = vem do teams.ts; "override" = adicionado/movido via admin. */
  source: "base" | "override";
  hidden: boolean;
};

function fullName(owner: Owner): string {
  const nome = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim();
  return nome || owner.email || `Owner ${owner.id}`;
}

/**
 * Resolve a lista final de farmers do dashboard, combinando a base fixa
 * (teams.ts) com os overrides do KV (admin).
 *
 * - Owner em teams.ts: entra com a squad do teams.ts
 * - Owner com override: a squad do override vence (mover de squad)
 * - Owner SÓ no override: entra como "adicionado pelo admin"
 * - hidden=true: continua no resultado, mas marcado pra ser filtrado
 *
 * Retorna TODOS (inclusive ocultos) — quem chama decide se filtra.
 */
export function resolveFarmers(
  owners: Map<string, Owner>,
  overrides: Map<string, FarmerOverride>
): ResolvedFarmer[] {
  const result: ResolvedFarmer[] = [];
  const seenOwnerIds = new Set<string>();

  // 1) Owners listados em teams.ts (via email)
  for (const owner of owners.values()) {
    const email = normalizeEmail(owner.email);
    const baseSquad = EMAIL_TO_SQUAD.get(email);
    if (!baseSquad) continue;
    const override = overrides.get(owner.id);
    result.push({
      ownerId: owner.id,
      email,
      nome: fullName(owner),
      squadId: override?.squadId ?? baseSquad,
      source: override ? "override" : "base",
      hidden: override?.hidden ?? false,
    });
    seenOwnerIds.add(owner.id);
  }

  // 2) Owners SÓ no override (adicionados pelo admin, fora do teams.ts)
  for (const [ownerId, override] of overrides) {
    if (seenOwnerIds.has(ownerId)) continue;
    const owner = owners.get(ownerId);
    if (!owner) continue; // owner não existe mais no HubSpot — ignora
    result.push({
      ownerId,
      email: normalizeEmail(owner.email),
      nome: fullName(owner),
      squadId: override.squadId,
      source: "override",
      hidden: override.hidden ?? false,
    });
  }

  return result;
}
