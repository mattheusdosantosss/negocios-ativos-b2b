import { Deal } from './hubspot'
import { CRITERIA, MAX_SCORE, STALE_EXCLUDED_FARMERS } from './constants'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FarmerMatrixRow {
  farmerId: string
  farmerName: string
  dealCount: number
  avgScore: number
  completionRate: number          // % deals com todos critérios
  scoreVariance: number           // desvio padrão das notas
  criteriaAbsenceRate: Record<string, number> // % ausência por critério
  staleDealCount: number          // deals sem atualização > 15 dias
  avgDaysSinceQualification: number
}

export interface StaleDeal {
  id: string
  name: string
  farmerName: string
  hubspotUrl: string
  daysSinceModified: number
  daysSinceQualification: number
  score: number
}

export interface Insight {
  type: 'critical' | 'warning' | 'info' | 'positive'
  title: string
  detail: string
}

export interface MacroKPIs {
  completionRate: number        // % deals com pontuação máxima (todos critérios)
  staleCount: number            // deals sem update > 15 dias
  criticalStaleCount: number    // sem update > 30 dias
  avgDaysSinceQualification: number
  highRiskFarmers: number       // farmers com avg < 7
  teamScoreVariance: number     // desvio padrão geral
  mostMissingCriterion: string  // critério mais ausente
  fullyQualifiedRate: number    // % com todos 6 critérios
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function daysSince(isoDate: string): number {
  if (!isoDate) return -1
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
  return Math.sqrt(variance)
}

function isFullyQualified(deal: Deal): boolean {
  return CRITERIA.every((c) => deal.criteria.includes(c.key))
}

// ─── Stale Deals ──────────────────────────────────────────────────────────────

export function computeStaleDeals(deals: Deal[], thresholdDays = 15): StaleDeal[] {
  return deals
    .filter((d) => !STALE_EXCLUDED_FARMERS.has(d.farmerId))
    .map((d) => ({
      id: d.id,
      name: d.name,
      farmerName: d.farmerName,
      hubspotUrl: d.hubspotUrl,
      daysSinceModified: daysSince(d.lastModifiedDate),
      daysSinceQualification: daysSince(d.date),
      score: d.score,
    }))
    .filter((d) => d.daysSinceModified >= thresholdDays)
    .sort((a, b) => b.daysSinceModified - a.daysSinceModified)
}

// ─── Farmer Matrix ────────────────────────────────────────────────────────────

export function computeFarmerMatrix(deals: Deal[]): FarmerMatrixRow[] {
  const map = new Map<string, Deal[]>()
  for (const deal of deals) {
    if (!deal.farmerId) continue
    if (!map.has(deal.farmerId)) map.set(deal.farmerId, [])
    map.get(deal.farmerId)!.push(deal)
  }

  const rows: FarmerMatrixRow[] = []
  for (const [farmerId, farmerDeals] of map.entries()) {
    const scoredDeals = farmerDeals.filter((d) => d.isScored)
    const scores = scoredDeals.map((d) => d.score)
    const avgScore = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
    const completionRate = farmerDeals.filter(isFullyQualified).length / farmerDeals.length

    const criteriaAbsenceRate: Record<string, number> = {}
    for (const c of CRITERIA) {
      const absent = farmerDeals.filter((d) => !d.criteria.includes(c.key)).length
      criteriaAbsenceRate[c.key] = absent / farmerDeals.length
    }

    const staleDealCount = STALE_EXCLUDED_FARMERS.has(farmerId) ? 0 : farmerDeals.filter(
      (d) => d.lastModifiedDate && daysSince(d.lastModifiedDate) >= 15
    ).length

    const qualDates = farmerDeals
      .filter((d) => d.date)
      .map((d) => daysSince(d.date))
    const avgDaysSinceQualification =
      qualDates.length > 0 ? qualDates.reduce((s, v) => s + v, 0) / qualDates.length : 0

    rows.push({
      farmerId,
      farmerName: farmerDeals[0].farmerName,
      dealCount: farmerDeals.length,
      avgScore,
      completionRate,
      scoreVariance: stdDev(scores),
      criteriaAbsenceRate,
      staleDealCount,
      avgDaysSinceQualification,
    })
  }

  return rows.sort((a, b) => b.avgScore - a.avgScore)
}

// ─── Macro KPIs ───────────────────────────────────────────────────────────────

export function computeMacroKPIs(deals: Deal[], matrix: FarmerMatrixRow[]): MacroKPIs {
  const staleDeals = computeStaleDeals(deals, 15)
  const criticalStale = computeStaleDeals(deals, 30)

  const allScores = deals.filter((d) => d.isScored).map((d) => d.score)
  const teamVariance = stdDev(allScores)

  const qualDays = deals.filter((d) => d.date).map((d) => daysSince(d.date))
  const avgDaysSinceQualification =
    qualDays.length > 0 ? qualDays.reduce((s, v) => s + v, 0) / qualDays.length : 0

  const highRiskFarmers = matrix.filter((f) => f.avgScore < 7).length

  // critério mais ausente por pontos perdidos
  let mostMissing = CRITERIA[0]
  let maxPointsLost = 0
  for (const c of CRITERIA) {
    const absent = deals.filter((d) => !d.criteria.includes(c.key)).length
    const pts = absent * c.weight
    if (pts > maxPointsLost) { maxPointsLost = pts; mostMissing = c }
  }

  const fullyQualifiedRate = deals.filter(isFullyQualified).length / (deals.length || 1)
  const scoredDeals = deals.filter((d) => d.isScored)
  const maxPossible = scoredDeals.length * MAX_SCORE
  const actual = scoredDeals.reduce((s, d) => s + d.score, 0)
  const completionRate = maxPossible > 0 ? actual / maxPossible : 0

  return {
    completionRate,
    staleCount: staleDeals.length,
    criticalStaleCount: criticalStale.length,
    avgDaysSinceQualification,
    highRiskFarmers,
    teamScoreVariance: teamVariance,
    mostMissingCriterion: mostMissing.label,
    fullyQualifiedRate,
  }
}

// ─── Auto Insights ────────────────────────────────────────────────────────────

export function generateInsights(deals: Deal[], matrix: FarmerMatrixRow[]): Insight[] {
  const insights: Insight[] = []
  if (deals.length === 0) return insights

  const stale15 = computeStaleDeals(deals, 15)
  const stale30 = computeStaleDeals(deals, 30)
  const fullyQualified = deals.filter(isFullyQualified)
  const fullyQualRate = fullyQualified.length / deals.length

  // 1. Qualificação completa
  if (fullyQualRate < 0.2) {
    insights.push({
      type: 'critical',
      title: 'Qualificação completa crítica',
      detail: `Apenas ${(fullyQualRate * 100).toFixed(0)}% dos negócios têm todos os critérios preenchidos. O time está criando deals sem qualificação estruturada.`,
    })
  } else if (fullyQualRate < 0.5) {
    insights.push({
      type: 'warning',
      title: 'Qualificação incompleta na maioria dos deals',
      detail: `${(fullyQualRate * 100).toFixed(0)}% dos negócios estão completamente qualificados. Mais da metade do pipeline tem brechas de informação.`,
    })
  } else {
    insights.push({
      type: 'positive',
      title: 'Qualificação sólida',
      detail: `${(fullyQualRate * 100).toFixed(0)}% dos negócios estão com qualificação completa. Padrão acima do esperado.`,
    })
  }

  // 2. Critério mais ausente
  let worstCriterion = CRITERIA[0]
  let worstCount = 0
  for (const c of CRITERIA) {
    const count = deals.filter((d) => !d.criteria.includes(c.key)).length
    if (count * c.weight > worstCount * worstCriterion.weight) {
      worstCount = count; worstCriterion = c
    }
  }
  const worstPct = (worstCount / deals.length * 100).toFixed(0)
  insights.push({
    type: worstCount / deals.length > 0.4 ? 'critical' : 'warning',
    title: `"${worstCriterion.label}" é o maior gargalo`,
    detail: `Ausente em ${worstPct}% dos negócios (peso ${worstCriterion.weight}). Cada ausência custa ${worstCriterion.weight} pontos — responsável por ${(worstCount * worstCriterion.weight)} pts perdidos no período.`,
  })

  // 3. Deals parados
  if (stale30.length > 0) {
    insights.push({
      type: 'critical',
      title: `${stale30.length} negócio${stale30.length > 1 ? 's' : ''} parado${stale30.length > 1 ? 's' : ''} há mais de 30 dias`,
      detail: `${stale30.map((d) => d.name).slice(0, 3).join(', ')}${stale30.length > 3 ? ` e mais ${stale30.length - 3}` : ''}. Sem movimentação, esses deals perdem relevância e distorcem o pipeline.`,
    })
  } else if (stale15.length > 0) {
    insights.push({
      type: 'warning',
      title: `${stale15.length} negócio${stale15.length > 1 ? 's' : ''} sem atualização há mais de 15 dias`,
      detail: `Atenção: ${stale15.slice(0, 3).map((d) => `${d.name} (${d.farmerName})`).join(', ')}${stale15.length > 3 ? ` e mais ${stale15.length - 3}` : ''}.`,
    })
  }

  // 4. Farmers abaixo de 7
  const lowFarmers = matrix.filter((f) => f.avgScore < 7)
  if (lowFarmers.length > 0) {
    insights.push({
      type: 'critical',
      title: `${lowFarmers.length} farmer${lowFarmers.length > 1 ? 's' : ''} com média abaixo de 7`,
      detail: `${lowFarmers.map((f) => `${f.farmerName} (${f.avgScore.toFixed(1)})`).join(', ')}. Abaixo desse limiar, os deals têm baixa probabilidade de conversão consistente.`,
    })
  }

  // 5. Alta variância — critério aplicado de forma inconsistente
  const highVarianceFarmers = matrix.filter((f) => f.scoreVariance > 2 && f.dealCount >= 3)
  if (highVarianceFarmers.length > 0) {
    insights.push({
      type: 'warning',
      title: 'Critérios aplicados de forma inconsistente',
      detail: `${highVarianceFarmers.map((f) => f.farmerName).join(', ')} têm alta variação nas notas (desvio padrão > 2). Indica critério subjetivo — o mesmo farmer qualifica deals muito diferentes da mesma forma.`,
    })
  }

  // 6. Farmer com muitos deals parados
  const farmerWithStale = matrix.filter((f) => f.staleDealCount >= 3)
  if (farmerWithStale.length > 0) {
    insights.push({
      type: 'warning',
      title: 'Farmers com pipeline estagnado',
      detail: `${farmerWithStale.map((f) => `${f.farmerName} (${f.staleDealCount} parados)`).join(', ')}. Deals sem progresso podem indicar falta de follow-up ou oportunidades inviáveis que não foram descartadas.`,
    })
  }

  // 7. Benchmark positivo
  const topFarmer = matrix[0]
  if (topFarmer && topFarmer.avgScore >= 9 && topFarmer.dealCount >= 5) {
    insights.push({
      type: 'positive',
      title: `${topFarmer.farmerName} é o benchmark do time`,
      detail: `Média ${topFarmer.avgScore.toFixed(1)} com ${topFarmer.dealCount} negócios e ${(topFarmer.completionRate * 100).toFixed(0)}% de qualificação completa. Padrão a ser replicado.`,
    })
  }

  // 8. Velocidade de qualificação (deals muito antigos ainda abertos)
  const oldDeals = deals.filter((d) => d.date && daysSince(d.date) > 60)
  if (oldDeals.length > 0) {
    insights.push({
      type: 'info',
      title: `${oldDeals.length} negócio${oldDeals.length > 1 ? 's' : ''} com mais de 60 dias desde a qualificação`,
      detail: `Deals qualificados há mais de 2 meses sem fechamento podem indicar ciclo longo ou oportunidade perdida não atualizada no CRM.`,
    })
  }

  return insights
}
