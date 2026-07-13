// Roster oficial dos Closers B2B. Qualquer negócio ativo cujo Proprietário
// não seja um desses 8 (farmer, SDR, ex-funcionário, sem dono etc.) é
// compilado numa única linha "Fora do time B2B" no painel — em vez de uma
// linha por pessoa aleatória, o que poluía a tabela.

export type TeamMember = { ownerId: string; nome: string };

export const B2B_TEAM: TeamMember[] = [
  { ownerId: "80454586", nome: "Rafael Teixeira" },
  { ownerId: "80651489", nome: "Catarina Varoni Borges" },
  { ownerId: "80454588", nome: "João Gabriel Marins Pereira" },
  { ownerId: "86859895", nome: "Mateus Mariano" },
  { ownerId: "87159365", nome: "João Lucas Backmann" },
  { ownerId: "80169395", nome: "Lucas Oliveira" },
  { ownerId: "92704130", nome: "Talita Santos Cruz" },
  { ownerId: "80454576", nome: "Eduardo Vince" },
];

export const B2B_TEAM_IDS = new Set(B2B_TEAM.map((m) => m.ownerId));

export const OUTSIDE_TEAM_ID = "fora-do-time";
export const OUTSIDE_TEAM_LABEL = "Fora do time B2B";
