import { Deal, ExcludedDeal, ForaDoMOAEntry } from './hubspot'
import { CRITERIA, FARMERS, MAX_SCORE, dealInTeam, uniqueDemandKey, isDealWithCreator } from './constants'

export interface FarmerStats {
  farmerId: string
  farmerName: string
  avgScore: number
  dealCount: number
  companyCount: number
  totalScore: number
}

export interface ScoreDistributionItem {
  score: number
  count: number
}

export interface CriterionAbsence {
  key: string
  label: string
  weight: number
  absentCount: number
  absentPercent: number
  pointsLost: number
}

export interface CriterionImpact {
  key: string
  label: string
  avgWithCriterion: number
  avgWithoutCriterion: number
  delta: number
}

export interface SummaryStats {
  totalDeals: number
  totalCompanies: number
  avgScore: number
  efficiency: number
  activeFarmers: number
  totalPossiblePoints: number
  totalActualPoints: number
  meetingScheduled: number
  meetingCompleted: number
  meetingNoShow: number
  stagnantWithCreator: number
}

export function computeFarmerRanking(deals: Deal[]): FarmerStats[] {
  const map = new Map<string, { name: string; totalScore: number; scoredCount: number; dealCount: number; companies: Set<string> }>()

  for (const deal of deals) {
    if (!deal.farmerId) continue
    const existing = map.get(deal.farmerId) ?? {
      name: deal.farmerName || FARMERS[deal.farmerId] || deal.farmerId,
      totalScore: 0, scoredCount: 0, dealCount: 0, companies: new Set<string>(),
    }
    existing.dealCount += 1
    existing.companies.add(uniqueDemandKey(deal))
    if (deal.isScored) {
      existing.totalScore += deal.score
      existing.scoredCount += 1
    }
    map.set(deal.farmerId, existing)
  }

  const result: FarmerStats[] = []
  for (const [farmerId, s] of map.entries()) {
    result.push({
      farmerId,
      farmerName: s.name,
      avgScore: s.scoredCount > 0 ? s.totalScore / s.scoredCount : 0,
      dealCount: s.dealCount,
      companyCount: s.companies.size,
      totalScore: s.totalScore,
    })
  }

  return result.sort((a, b) => b.avgScore - a.avgScore)
}

export function computeScoreDistribution(deals: Deal[]): ScoreDistributionItem[] {
  const scores = [6, 7, 8, 9, 10, 11, 12]
  const counts = new Map<number, number>()

  for (const s of scores) counts.set(s, 0)

  for (const deal of deals) {
    if (!deal.isScored) continue
    const s = Math.round(deal.score)
    if (counts.has(s)) {
      counts.set(s, (counts.get(s) || 0) + 1)
    }
  }

  return scores.map((s) => ({ score: s, count: counts.get(s) || 0 }))
}

export function computeCriteriaAnalysis(deals: Deal[]): {
  absence: CriterionAbsence[]
  impact: CriterionImpact[]
} {
  const total = deals.length

  const absence: CriterionAbsence[] = CRITERIA.map((criterion) => {
    const absentCount = deals.filter((d) => !d.criteria.includes(criterion.key)).length
    const absentPercent = total > 0 ? (absentCount / total) * 100 : 0
    const pointsLost = absentCount * criterion.weight

    return {
      key: criterion.key,
      label: criterion.label,
      weight: criterion.weight,
      absentCount,
      absentPercent,
      pointsLost,
    }
  }).sort((a, b) => b.pointsLost - a.pointsLost)

  const impact: CriterionImpact[] = CRITERIA.map((criterion) => {
    const withCriterion = deals.filter((d) => d.criteria.includes(criterion.key))
    const withoutCriterion = deals.filter((d) => !d.criteria.includes(criterion.key))

    const avgWith =
      withCriterion.length > 0
        ? withCriterion.reduce((sum, d) => sum + d.score, 0) / withCriterion.length
        : 0

    const avgWithout =
      withoutCriterion.length > 0
        ? withoutCriterion.reduce((sum, d) => sum + d.score, 0) / withoutCriterion.length
        : 0

    return {
      key: criterion.key,
      label: criterion.label,
      avgWithCriterion: avgWith,
      avgWithoutCriterion: avgWithout,
      delta: avgWith - avgWithout,
    }
  })

  return { absence, impact }
}

export function computeSummaryStats(deals: Deal[]): SummaryStats {
  const totalDeals = deals.length
  const scoredDeals = deals.filter((d) => d.isScored)
  const totalActualPoints = scoredDeals.reduce((sum, d) => sum + d.score, 0)
  const avgScore = scoredDeals.length > 0 ? totalActualPoints / scoredDeals.length : 0
  const totalPossiblePoints = scoredDeals.length * MAX_SCORE
  const efficiency = totalPossiblePoints > 0 ? (totalActualPoints / totalPossiblePoints) * 100 : 0

  const activeFarmerIds = new Set(deals.map((d) => d.farmerId).filter(Boolean))

  // Reuniões contadas por EMPRESA ÚNICA (mesma regra da conversão por farmer):
  // uma empresa com várias demandas conta uma vez.
  const companyMeetings = new Map<string, { scheduled: boolean; completed: boolean; noShow: boolean }>()
  for (const d of deals) {
    const ck = uniqueDemandKey(d)
    const c = companyMeetings.get(ck) ?? { scheduled: false, completed: false, noShow: false }
    if (d.meetingScheduled) c.scheduled = true
    if (d.meetingCompleted) c.completed = true
    if (d.meetingNoShow) c.noShow = true
    companyMeetings.set(ck, c)
  }
  const meetingScheduled = Array.from(companyMeetings.values()).filter((c) => c.scheduled).length
  const meetingCompleted = Array.from(companyMeetings.values()).filter((c) => c.completed).length
  const meetingNoShow = Array.from(companyMeetings.values()).filter((c) => c.noShow).length

  const totalCompanies = new Set(deals.map((d) => uniqueDemandKey(d))).size
  const stagnantWithCreator = deals.filter((d) => isDealWithCreator(d.farmerId, d.ownerId)).length

  return {
    totalDeals,
    totalCompanies,
    avgScore,
    efficiency,
    activeFarmers: activeFarmerIds.size,
    totalPossiblePoints,
    totalActualPoints,
    meetingScheduled,
    meetingCompleted,
    meetingNoShow,
    stagnantWithCreator,
  }
}

export function filterDealsByMonth(deals: Deal[], month: string | null): Deal[] {
  if (!month) return deals

  const [year, monthNum] = month.split('-').map(Number)
  const start = new Date(year, monthNum - 1, 1).getTime()
  const end = new Date(year, monthNum, 1).getTime()

  return deals.filter((d) => {
    if (!d.date) return false
    const ts = new Date(d.date).getTime()
    return ts >= start && ts < end
  })
}

export type PeriodKey = '' | 'hoje' | 'ontem' | 'esta-semana' | '7dias' | 'este-mes' | 'mes-passado' | '30dias' | 'este-ano' | 'entre'

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '', label: 'Todo o período' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'esta-semana', label: 'Esta semana' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: 'este-mes', label: 'Este mês' },
  { value: 'mes-passado', label: 'Mês passado' },
  { value: '30dias', label: 'Últimos 30 dias' },
  { value: 'este-ano', label: 'Este ano' },
  { value: 'entre', label: 'Entre datas...' },
]

export function getPeriodRange(period: PeriodKey): { start: Date; end: Date } | null {
  if (!period) return null
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  switch (period) {
    case 'hoje':
      return { start: todayStart, end: todayEnd }
    case 'ontem': {
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
      return { start: yesterdayStart, end: todayStart }
    }
    case 'esta-semana': {
      const dayOfWeek = todayStart.getDay()
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const monday = new Date(todayStart.getTime() - mondayOffset * 24 * 60 * 60 * 1000)
      return { start: monday, end: todayEnd }
    }
    case '7dias':
      return { start: new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000), end: todayEnd }
    case 'este-mes':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: todayEnd }
    case 'mes-passado': {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { start: firstOfLastMonth, end: firstOfThisMonth }
    }
    case '30dias':
      return { start: new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000), end: todayEnd }
    case 'este-ano':
      return { start: new Date(now.getFullYear(), 0, 1), end: todayEnd }
    default:
      return null
  }
}

export function filterDealsByPeriod(deals: Deal[], period: PeriodKey, customRange?: { start: string; end: string }): Deal[] {
  if (period === 'entre' && customRange) {
    const startMs = new Date(customRange.start).getTime()
    const endMs = new Date(customRange.end + 'T23:59:59').getTime()
    return deals.filter((d) => {
      if (!d.date) return false
      const ts = new Date(d.date).getTime()
      return ts >= startMs && ts <= endMs
    })
  }
  const range = getPeriodRange(period)
  if (!range) return deals
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()
  return deals.filter((d) => {
    if (!d.date) return false
    const ts = new Date(d.date).getTime()
    return ts >= startMs && ts < endMs
  })
}

// Mês de referência de um período. Retorna null quando o período não cabe
// dentro de um único mês civil (aí quem consome cai no mês corrente).
export function periodToMonthKey(
  period: PeriodKey,
  customRange?: { start: string; end: string },
): string | null {
  if (!period) return null
  if (period === 'entre') {
    if (!customRange?.start || !customRange?.end) return null
    const startMonth = customRange.start.slice(0, 7)
    const endMonth = customRange.end.slice(0, 7)
    return startMonth === endMonth ? startMonth : null
  }
  const range = getPeriodRange(period)
  if (!range) return null
  const d = period === 'mes-passado' ? range.start : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Períodos que cobrem um mês civil inteiro — nesses casos o card de meta
// mensal e o resto da página falam da mesma janela de tempo.
export function periodCoversWholeMonth(
  period: PeriodKey,
  customRange?: { start: string; end: string },
): boolean {
  if (period === '' || period === 'este-mes' || period === 'mes-passado') return true
  if (period === 'entre' && customRange?.start && customRange?.end) {
    const [startYear, startMonth, startDay] = customRange.start.split('-').map(Number)
    const [endYear, endMonth, endDay] = customRange.end.split('-').map(Number)
    if (startYear !== endYear || startMonth !== endMonth) return false
    const lastDay = new Date(endYear, endMonth, 0).getDate()
    return startDay === 1 && endDay === lastDay
  }
  return false
}

export function getAvailableMonths(deals: Deal[]): string[] {
  const months = new Set<string>()

  for (const deal of deals) {
    if (!deal.date) continue
    const d = new Date(deal.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.add(key)
  }

  return Array.from(months).sort()
}

export function filterDealsByTeam(deals: Deal[], teamId: string | null): Deal[] {
  if (!teamId) return deals
  // Sensível à data: negócios antigos usam a formação antiga; jul/26+ a nova.
  return deals.filter((d) => dealInTeam(d.farmerId, d.date, teamId))
}

export function computeForaDoMOA(
  excludedDeals: ExcludedDeal[],
  teamId: string | null,
  monthKey: string | null,
): ForaDoMOAEntry[] {
  let filtered = excludedDeals

  if (teamId) {
    filtered = filtered.filter((d) => dealInTeam(d.farmerId, d.date, teamId))
  }

  if (monthKey) {
    filtered = filtered.filter((d) => {
      if (!d.date) return false
      const date = new Date(d.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      return key === monthKey
    })
  }

  const byFarmer: Record<string, number> = {}
  for (const d of filtered) {
    byFarmer[d.farmerName] = (byFarmer[d.farmerName] ?? 0) + 1
  }

  return Object.entries(byFarmer)
    .map(([farmerName, count]) => ({ farmerName, count }))
    .sort((a, b) => b.count - a.count)
}

export interface OppsByDayResult {
  monthKey: string
  owners: { name: string; total: number }[]   // top-N + "Outros", ordem de empilhamento
  rows: Array<Record<string, number | string>> // { day:'01', <farmer>:n, ..., total:n }
  grandTotal: number
}

const SEM_FARMER = 'Sem farmer'

// Volume de oportunidades por dia do mês, empilhado por farmer.
// Destaca os topN farmers; o restante é agrupado em "Outros".
export function computeOpportunitiesByDay(deals: Deal[], monthKey: string, topN = 7): OppsByDayResult {
  const monthDeals = deals.filter((d) => d.date && d.date.slice(0, 7) === monthKey)

  // total por farmer → escolhe os topN
  const totalByOwner = new Map<string, number>()
  for (const d of monthDeals) {
    const owner = d.farmerName || SEM_FARMER
    totalByOwner.set(owner, (totalByOwner.get(owner) ?? 0) + 1)
  }
  const ranked = Array.from(totalByOwner.entries()).sort((a, b) => b[1] - a[1])
  const topOwners = ranked.slice(0, topN).map(([name]) => name)
  const topSet = new Set(topOwners)
  const hasOutros = ranked.length > topN

  const bucket = (owner: string) => (topSet.has(owner) ? owner : 'Outros')

  // dias do mês: 01..último dia; se for o mês corrente, vai só até hoje
  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const lastDay = isCurrentMonth ? now.getDate() : daysInMonth

  const ownerOrder = [...topOwners]
  if (hasOutros) ownerOrder.push('Outros')

  const rows: Array<Record<string, number | string>> = []
  for (let day = 1; day <= lastDay; day++) {
    const dd = String(day).padStart(2, '0')
    const row: Record<string, number | string> = { day: dd }
    for (const o of ownerOrder) row[o] = 0
    rows.push(row)
  }

  let grandTotal = 0
  for (const d of monthDeals) {
    const day = parseInt(d.date.slice(8, 10), 10)
    if (day < 1 || day > lastDay) continue
    const key = bucket(d.farmerName || SEM_FARMER)
    const row = rows[day - 1]
    row[key] = (row[key] as number) + 1
    row.total = (row.total as number ?? 0) + 1
    grandTotal += 1
  }
  for (const row of rows) if (row.total === undefined) row.total = 0

  const owners = ownerOrder.map((name) => ({
    name,
    total: name === 'Outros'
      ? ranked.slice(topN).reduce((s, [, c]) => s + c, 0)
      : (totalByOwner.get(name) ?? 0),
  }))

  return { monthKey, owners, rows, grandTotal }
}

export interface FarmerMeetingStats {
  farmerId: string
  farmerName: string
  totalCompanies: number   // empresas únicas (base da conversão)
  totalDeals: number       // oportunidades (referência)
  scheduled: number        // empresas com ≥1 reunião agendada
  scheduledPct: number
  completed: number        // empresas com ≥1 reunião realizada
  completedPct: number
}

// Conversão de reuniões por farmer, contada por EMPRESA ÚNICA (não por oportunidade):
// uma empresa com várias demandas conta uma vez. Agendar reunião em qualquer
// demanda da empresa marca a empresa como agendada.
export function computeMeetingConversion(deals: Deal[]): FarmerMeetingStats[] {
  const map = new Map<string, {
    name: string
    deals: number
    companies: Map<string, { scheduled: boolean; completed: boolean }>
  }>()

  for (const d of deals) {
    if (!d.farmerId) continue
    const e = map.get(d.farmerId) ?? { name: d.farmerName, deals: 0, companies: new Map() }
    e.deals += 1
    const ck = uniqueDemandKey(d)
    const c = e.companies.get(ck) ?? { scheduled: false, completed: false }
    if (d.meetingScheduled) c.scheduled = true
    if (d.meetingCompleted) c.completed = true
    e.companies.set(ck, c)
    map.set(d.farmerId, e)
  }

  return Array.from(map.entries())
    .map(([farmerId, e]) => {
      const comps = Array.from(e.companies.values())
      const totalCompanies = comps.length
      const scheduled = comps.filter((c) => c.scheduled).length
      const completed = comps.filter((c) => c.completed).length
      return {
        farmerId,
        farmerName: e.name,
        totalCompanies,
        totalDeals: e.deals,
        scheduled,
        scheduledPct: totalCompanies > 0 ? Math.round((scheduled / totalCompanies) * 100) : 0,
        completed,
        // Base = empresas únicas, igual a scheduledPct. As duas taxas passam a
        // ser comparáveis entre si e respondem "de tudo que gerei, quanto
        // virou reunião de fato" — e não "das que agendei, quantas ocorreram".
        completedPct: totalCompanies > 0 ? Math.round((completed / totalCompanies) * 100) : 0,
      }
    })
    .filter((f) => f.scheduled > 0)
    .sort((a, b) => b.completedPct - a.completedPct)
}
