export const FARMERS: Record<string, string> = {
  '87159365': 'João Lucas',
  '88200239': 'Luiza',
  '79760745': 'Thiago',
  '86256444': 'Ana Carolina',
  '84497577': 'Vitória',
  '85002012': 'Bruna Machado',
  '85002282': 'Sotoriva',
  '93238814': 'Sotoriva',   // conta nova — alias para 85002282
  '85846972': 'Daniela',
  '85846971': 'Fran Lenz',
  '81033487': 'Gustavo',
  '88200222': 'Kennedy',
  '87371619': 'Maryna',
  '84015882': 'Amanda',
  '89632494': 'Willker',
  '82410958': 'Maria Eduarda',
  '92333469': 'Rafael',
  '92335488': 'Thaina',
  '93599591': 'Bruna Saraiva',
  '89632472': 'Maria Eduarda Porto',
  '80228367': 'Jhuly',
  '94028856': 'Felippe Freitas',
  '94316537': 'Maria Julia',
  '94316538': 'Gabriel Alves',
  '94399135': 'Gabriela',
  '94891358': 'Priscila',
  '95283516': 'Julia',
  '95415669': 'Gisele Santos',
  '95810969': 'Rhayssa',
  '95993082': 'Hans Lopes',
  '96589066': 'Nathalia',
  '95811085': 'Wagner',
  '96198720': 'Alexcia',
  '84249251': 'Tércio',
  '80688884': 'Rafael Brack',
  '96198838': 'Leonardo Gomes',
  '97204561': 'Juliano',
  '97204635': 'Samuel',
  '97763591': 'Leonardo Bitencourt',
  '98715090': 'Vitor',
  '98715128': 'Mayke',
  '98715151': 'Matheus',
  '99956495': 'Milena',
  '92704130': 'Talita',
  '100465709': 'Bruno Beck',
  '100619918': 'Eduardo Godoy',
}

// Segmento da carteira individual de cada farmer
export const FARMER_SEGMENTS: Record<string, string> = {
  '97763591': 'Contabilidades e Advocacias',           // Leonardo Bitencourt
  '98715090': 'Prefeituras',                            // Vitor
  '98715128': 'Construção Civil e Imobiliário',         // Mayke
  '98715151': 'Sistema S',                              // Matheus (assumiu a carteira em out/26)
  '85002282': 'Cooperativas de Crédito e Unimed',      // Sotoriva
  '93238814': 'Cooperativas de Crédito e Unimed',      // Sotoriva (alias)
  '95415669': 'Serviços I',                             // Gisele Santos
  '92335488': 'Serviços II',                            // Thaina (assumiu a carteira em out/26)
  '93599591': 'Indústria I',                            // Bruna Saraiva
  '85846971': 'Indústria II',                           // Fran Lenz
  '97204561': 'Tecnologia e Software II',               // Juliano
  '80228367': 'Agronegócio e Cooperativas do Agro',    // Jhuly
  '94316537': 'Tecnologia e Software I',                // Maria Julia
  '84497577': 'Bancos e Fintechs',                     // Vitória
  '95993082': 'Energia, Mineração e Utilities',         // Hans Lopes
  '95810969': 'Educação Básico e Superior I',           // Rhayssa
  '88200239': 'Associações, Conselhos e Organizações',  // Luiza
  '94028856': 'Logística e Transporte',                 // Felippe Freitas (assumiu a carteira em out/26)
  '81033487': 'Serviços II',                            // Gustavo
  '89632472': 'Varejo e Comércio II',                   // Maria Eduarda Porto
  '79760745': 'Logística e Transporte',                 // Thiago
  '96589066': 'Saúde I (Exceto Unimed)',                // Nathalia
  '87159365': 'Tecnologia e Software III',              // João Lucas
  '92704130': 'Secretarias de Estado e Tribunais',      // Talita
  '99956495': 'Construção Civil e Imobiliário',         // Milena
  '100465709': 'Varejo e Comércio I',                   // Bruno Beck
  '100619918': 'Serviços I',                            // Eduardo Godoy (assumiu a carteira da Gisele)
  '94399135': 'Agências e Assessorias de Palestras',    // Gabriela
}

// Farmers que criam negócios para si mesmos — excluídos da contagem de "parados"
export const STALE_EXCLUDED_FARMERS = new Set([
  '95811085', // Wagner
  '79760745', // Thiago
  '81033487', // Gustavo
  '94028856', // Felippe Freitas
  '85002012', // Bruna Machado
  '87159365', // João Backmann
  '82410958', // Maria Eduarda
  '84249251', // Tércio
])

// Maps old/extra farmer IDs to their canonical ID so deals are merged in analytics
export const FARMER_ALIASES: Record<string, string> = {
  '93238814': '85002282',  // Sotoriva nova conta → ID canônico
}

// Overrides pontuais: deal IDs que devem ser forçados para um farmer específico
// (erro de cadastro no HubSpot que não pode ser corrigido lá)
export const DEAL_FARMER_OVERRIDES: Record<string, string> = {
  '62654660376': '85002012', // Mayra | Credipronto → Bruna Machado (farmer original errado)
}

// Deals recuperados que converteram em venda — contam uma segunda vez para o farmer.
// Chave: deal ID original. Valor: farmer ID (pode ser o mesmo) e data da recontagem.
export const BONUS_DEALS: Array<{ dealId: string; farmerId: string; date: string }> = [
  { dealId: '62358745469', farmerId: '85002282', date: '2026-08-25' }, // Suzane | Equatorial Goiás — Sotoriva (recuperado)
]

// Deals que devem ignorar o filtro de origem (erro de cadastro no HubSpot)
export const ORIGIN_OVERRIDE_DEAL_IDS = new Set([
  '62654660376', // Mayra | Credipronto — Bruna Machado (inbound, deveria ser Farmer)
  '63187333523', // Gabriela | FDC — Maria Julia (inbound, deveria ser Farmer)
])

// Per-farmer date restrictions applied after fetching
// fromDate: ignore deals before this date (YYYY-MM-DD)
// untilDate: ignore deals from this date onwards — keeps history, removes future
// excludeRange: ignore deals within this closed range [from, until)
type DateRestriction = { fromDate?: string; untilDate?: string; excludeRange?: { from: string; until: string } }
export const FARMER_DATE_RESTRICTIONS: Record<string, DateRestriction> = {
  '81033487': { fromDate: '2026-04-01' },  // Gustavo: entra em abril/26 (março era transição)
  '84497577': { fromDate: '2026-03-01' },  // Vitória: entra em março/26
  '88200222': { untilDate: '2026-06-01' }, // Kennedy: saiu em junho/26
  '87371619': { untilDate: '2026-06-01' }, // Maryna: saiu em junho/26
  '86256444': { untilDate: '2026-07-01' }, // Ana Carolina: fora da formação nova (jul/26)
  '89632494': { untilDate: '2026-07-01' }, // Willker: fora da formação nova (jul/26)
  '82410958': { untilDate: '2026-07-01' }, // Maria Eduarda (conta antiga arquivada)
  '88200239': { excludeRange: { from: '2026-08-01', until: '2026-09-01' } }, // Luiza: fora em ago/26, volta em set/26
  '84015882': { untilDate: '2026-08-01' }, // Amanda: fora da formação ago/26
  '94316538': { untilDate: '2026-08-01' }, // Gabriel Alves: fora da formação ago/26
  '94399135': { untilDate: '2026-08-01' }, // Gabriela Charlier: fora da formação ago/26
  '95283516': { untilDate: '2026-08-01' }, // Julia: fora da formação ago/26
  '85846972': { untilDate: '2026-08-01' }, // Daniela: fora da formação ago/26
  '92333469': { untilDate: '2026-08-01' }, // Rafael: fora da formação ago/26 (era seller)
  '96198838': { untilDate: '2026-08-18' }, // Leonardo Gomes: saiu dia 17, conta até dia 17
  '97204635': { untilDate: '2026-09-20' }, // Samuel: saiu da empresa em 19/09/26
  '94891358': { untilDate: '2026-09-01' }, // Priscila: fora da formação set/26
  '80688884': { untilDate: '2026-09-29' }, // Rafael Brack: sai do escopo de farmer em 28/09/26
  '95811085': { untilDate: '2026-09-01' }, // Wagner: fora da formação set/26
  '96198720': { untilDate: '2026-09-01' }, // Alexcia: fora da formação set/26
  '85002012': { untilDate: '2026-09-01' }, // Bruna Machado: fora da formação set/26
  '84249251': { untilDate: '2026-09-01' }, // Tércio: fora da formação set/26
}

// ── Filtro de origem do lead (vale apenas de ORIGIN_CUTOVER em diante) ──
// De julho/26 pra frente, só contam no resultado do farmer os leads com
// origem_do_lead na allowlist OU origem_da_qualificacao = Farmer.
// Histórico (antes do cutover) mantém todos os leads.
export const ORIGIN_CUTOVER = '2026-07-01'
export const ALLOWED_ORIGEM_DO_LEAD = ['Ação de CRM', 'Ação de CRM (Carteira)', 'Carteira do Farmer', 'CARTEIRA (Executivos em foco)']
export const ALLOWED_ORIGEM_QUALIFICACAO = ['Farmer']

export const HUBSPOT_PORTAL_ID = '49656171'

// Closers B2C — negócios cujo curador (owner) é um desses nomes
// foram encaminhados ao time B2C. Match por substring case-insensitive.
export const B2C_CLOSER_NAMES = ['mayda', 'joão araújo', 'joao araujo', 'amanda de oliveira', 'willker', 'gabrielly', 'luiza rodriguez', 'camila fay', 'tercio']

export function isB2CCloser(ownerName: string): boolean {
  const lower = ownerName.toLowerCase()
  return B2C_CLOSER_NAMES.some((n) => lower.includes(n))
}

// Farmers que viraram vendedores — deals com eles não contam como estagnados
const SELLER_FARMER_IDS = new Set(['92333469', '94316538']) // Rafael, Gabriel Alves

export function isDealWithCreator(farmerId: string, ownerId: string): boolean {
  if (!ownerId) return false
  if (SELLER_FARMER_IDS.has(farmerId)) return false
  const canonicalOwner = FARMER_ALIASES[ownerId] ?? ownerId
  return canonicalOwner === farmerId
}

// Funis B2C: cada oportunidade é uma demanda única (pessoa/negócio individual),
// então NÃO deduplica por empresa — mesmo que tenha (ou não tenha) empresa.
export const B2C_PIPELINE_IDS = new Set(['725182862', '727938450', '904543067'])

export const WON_STAGES = ['1076664462', '1076664460']

// Chave de "empresa/demanda única" usada em todas as contagens de empresas únicas:
// - B2C: sempre única (usa o id do negócio)
// - B2B com empresa: deduplica pela empresa
// - sem empresa: conta como única (usa o id do negócio)
export function uniqueDemandKey(deal: { id: string; pipeline: string; companyId: string; farmerId?: string }): string {
  const prefix = deal.farmerId ? `${deal.farmerId}:` : ''
  if (B2C_PIPELINE_IDS.has(deal.pipeline)) return `${prefix}deal:${deal.id}`
  return `${prefix}${deal.companyId || `deal:${deal.id}`}`
}

type TeamMap = Record<string, { label: string; farmerIds: string[] }>

// Formação até 30/06/2026
const TEAMS_BEFORE: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['89632494', '87159365', '88200239', '86256444', '84015882', '94028856', '94316538'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '84497577', '85002012', '85846972', '93599591', '79760745', '80228367'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['92333469', '85846971', '82410958', '81033487', '92335488', '89632472', '94316537'],
  },
}

// Formação julho/2026
const TEAMS_JULY: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['85002012', '81033487', '94316538', '88200239', '84015882', '94028856', '94891358', '95415669', '95810969', '95993082'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['84497577', '92333469', '92335488', '85846971', '94399135', '94316537', '95283516', '87159365'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '89632472', '79760745', '85846972', '93599591', '80228367'],
  },
}

// Formação a partir de agosto/2026
const TEAMS_AUG: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['95810969', '96589066', '85002282', '93238814', '94316537', '94028856', '81033487'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['94891358', '95993082', '80688884', '92335488', '95811085', '79760745', '97204561'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['95415669', '85846971', '93599591', '87159365', '89632472', '96198720', '97763591'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '84497577', '85002012', '84249251', '97204635'],
  },
}

// Formação a partir de setembro/2026
const TEAMS_SEP: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['97763591', '97204561', '97204635', '98715090'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '80688884', '93599591', '85846971'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['94028856', '81033487', '89632472', '79760745', '96589066', '87159365'],
  },
}

// Formação a partir de 14/09/2026: Juliano → Katy, Brack → Letícia
const TEAMS_SEP14: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['97763591', '98715090', '80688884', '98715128', '98715151'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['94028856', '81033487', '89632472', '79760745', '96589066', '87159365'],
  },
}

// 25/09: Nathalia sai do time do Dani para o da Camila; Matheus, da Letícia para a Katy.
const TEAMS_SEP25: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['97763591', '98715090', '80688884', '98715128'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561', '98715151'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239', '96589066'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['94028856', '81033487', '89632472', '79760745', '87159365'],
  },
}

// 28/09: Felippe vai para o time da Letícia e Rafael Brack sai do escopo de farmer.
const TEAMS_SEP28: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['97763591', '98715090', '98715128', '94028856'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561', '98715151'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239', '96589066'],
  },
  dani: {
    label: 'Time Dani',
    farmerIds: ['81033487', '89632472', '79760745', '87159365'],
  },
}

const TEAMS_OCT: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['99956495', '94028856', '92704130'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561', '98715151'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239', '96589066'],
  },
}

// 05/10: Bruno Beck entra no Time Letícia.
const TEAMS_OCT05: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['99956495', '94028856', '92704130', '100465709'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561', '98715151'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239', '96589066'],
  },
}

// 07/10: Eduardo Godoy entra no Time Katy, assumindo a carteira de Serviços I.
const TEAMS_OCT07: TeamMap = {
  leticia: {
    label: 'Time Leticia',
    farmerIds: ['99956495', '94028856', '92704130', '100465709'],
  },
  katyeli: {
    label: 'Time Katy',
    farmerIds: ['85002282', '93238814', '95415669', '92335488', '93599591', '85846971', '97204561', '98715151', '100619918'],
  },
  camila: {
    label: 'Time Cami',
    farmerIds: ['80228367', '94316537', '84497577', '95993082', '95810969', '88200239', '96589066'],
  },
}

const TEAM_PERIODS: { from: number; teams: TeamMap }[] = [
  { from: new Date('2026-10-07').getTime(), teams: TEAMS_OCT07 },
  { from: new Date('2026-10-05').getTime(), teams: TEAMS_OCT05 },
  { from: new Date('2026-10-01').getTime(), teams: TEAMS_OCT },
  { from: new Date('2026-09-28').getTime(), teams: TEAMS_SEP28 },
  { from: new Date('2026-09-25').getTime(), teams: TEAMS_SEP25 },
  { from: new Date('2026-09-14').getTime(), teams: TEAMS_SEP14 },
  { from: new Date('2026-09-01').getTime(), teams: TEAMS_SEP },
  { from: new Date('2026-08-01').getTime(), teams: TEAMS_AUG },
  { from: new Date('2026-07-01').getTime(), teams: TEAMS_JULY },
]

export const TEAMS: TeamMap = TEAMS_OCT07

// Metas mensais de empresas únicas, por mês de vigência (mais recente primeiro).
// teamGoals: metas individuais por time (quando diferem entre si).
type GoalPeriod = { from: string; total: number; perTeam: number; teamGoals?: Record<string, number> }
const GOAL_PERIODS: GoalPeriod[] = [
  { from: '2026-10', total: 340, perTeam: 140, teamGoals: { leticia: 60 } },
  { from: '2026-09', total: 400, perTeam: 110, teamGoals: { leticia: 80, dani: 100 } },
  { from: '2026-08', total: 480, perTeam: 120 }, // 4 times
  { from: '2026-07', total: 336, perTeam: 112 }, // 3 times
  { from: '2026-06', total: 300, perTeam: 100 }, // 3 times
]
// Meses anteriores a jun/26 herdam a meta de junho.
const GOAL_BEFORE: GoalPeriod = { from: '0000-00', total: 300, perTeam: 100 }

/** Meta do mês (YYYY-MM). Quando `teamId` é informado, retorna a meta específica desse time. */
export function monthlyGoal(monthKey: string, teamId?: string | null): number {
  const period = GOAL_PERIODS.find((p) => monthKey >= p.from) ?? GOAL_BEFORE
  if (!teamId) return period.total
  return period.teamGoals?.[teamId] ?? period.perTeam
}

/**
 * Quem passou por um time (ou pela operação toda) dentro de um período.
 *
 * Relatório histórico não pode usar só a formação de hoje: quem saiu levaria o
 * passado junto, e o número do time mudaria sozinho. Aqui entra todo mundo que
 * esteve lá em qualquer momento da janela.
 */
export function farmersDoPeriodo(teamId: string | null, deIso: string, ateIso: string): string[] {
  const de = new Date(deIso).getTime()
  const ate = new Date(ateIso).getTime()
  const mapas: TeamMap[] = [TEAMS_BEFORE]
  for (let i = 0; i < TEAM_PERIODS.length; i++) {
    const inicio = TEAM_PERIODS[i].from
    // a formação vale do seu início até o começo da formação seguinte
    const fim = i === 0 ? Infinity : TEAM_PERIODS[i - 1].from
    if (inicio <= ate && fim >= de) mapas.push(TEAM_PERIODS[i].teams)
  }
  const fora = new Set<string>()
  for (const mapa of mapas) {
    for (const [chave, time] of Object.entries(mapa)) {
      if (teamId && chave !== teamId) continue
      for (const id of time.farmerIds) fora.add(id)
    }
  }
  return [...fora]
}

export function dealInTeam(farmerId: string, dateIso: string, teamId: string): boolean {
  const ts = dateIso ? new Date(dateIso).getTime() : 0
  let map: TeamMap = TEAMS_BEFORE
  for (const period of TEAM_PERIODS) {
    if (ts >= period.from) { map = period.teams; break }
  }
  const team = map[teamId]
  return team ? team.farmerIds.includes(farmerId) : false
}

export const CRITERIA: Array<{ key: string; label: string; weight: number }> = [
  { key: 'reuniao_agendada', label: 'Reunião agendada', weight: 3 },
  { key: 'tempo_de_compra_45_dias', label: 'Tempo de compra 45 dias', weight: 3 },
  { key: 'data_do_evento_ate_6_meses', label: 'Data do evento até 6 meses', weight: 2 },
  { key: 'historico_de_contratacao', label: 'Histórico de contratação', weight: 2 },
  { key: 'qualificacao_completa', label: 'Qualificação completa', weight: 1 },
  { key: 'faixa_de_investimento_informada', label: 'Faixa de investimento', weight: 1 },
]

export const MAX_SCORE = 12
