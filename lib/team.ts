// Roster oficial dos Closers B2B. Usado só pra métrica "Fora do time B2B" no
// cabeçalho (negócios cujo dono não é um desses closers) — a tabela continua
// mostrando uma linha por dono real, mesmo os que não são do time B2B.

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
  // Closers temporários incluídos em jul/2026 pra reforçar as vendas B2B.
  { ownerId: "80454573", nome: "Nicollas Lenuzza" },
  { ownerId: "79760744", nome: "Diego Conceição" },
  { ownerId: "80454585", nome: "Leandro Bengochea" },
  { ownerId: "92333469", nome: "Rafael Oliveira Alves" },
  { ownerId: "94316538", nome: "Gabriel Oliveira Alves" },
];

export const B2B_TEAM_IDS = new Set(B2B_TEAM.map((m) => m.ownerId));
