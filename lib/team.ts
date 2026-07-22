// Rosters oficiais dos Closers por segmento. Usados só pra métrica "Fora do
// time" no cabeçalho (negócios cujo dono não é um desses closers) — a tabela
// continua mostrando uma linha por dono real, mesmo os que não são do time.

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
  { ownerId: "80454584", nome: "Cesar Luiz dos Santos Filho" },
  { ownerId: "94028856", nome: "Andrei Felippe Freitas de Mello" },
  { ownerId: "95811085", nome: "Wagner Macedo Freitas" },
];

export const B2B_TEAM_IDS = new Set(B2B_TEAM.map((m) => m.ownerId));

// Roster oficial dos Closers B2C (pipeline "Funil de Vendas B2C"). Confirmado
// em jul/2026 pela volumetria de negócios ativos + validação do usuário.
export const B2C_TEAM: TeamMember[] = [
  { ownerId: "79760746", nome: "Mayda Quadros" },
  { ownerId: "88628309", nome: "João Paulo da Silveira Araújo" },
  { ownerId: "88628313", nome: "Gabrielly Milani da Silva" },
  { ownerId: "89632494", nome: "Willker Santos Belous" },
  { ownerId: "79760676", nome: "Amanda de Oliveira" },
  { ownerId: "93470034", nome: "Franciele Oliveira" },
  { ownerId: "81035544", nome: "Camila Fay" },
  { ownerId: "84249251", nome: "Tércio Ferreira da Silva" },
];

export const B2C_TEAM_IDS = new Set(B2C_TEAM.map((m) => m.ownerId));
