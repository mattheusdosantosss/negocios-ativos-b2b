import {
  FARMERS, FARMER_ALIASES, FARMER_DATE_RESTRICTIONS, CRITERIA, HUBSPOT_PORTAL_ID,
  ORIGIN_CUTOVER, ALLOWED_ORIGEM_DO_LEAD, ALLOWED_ORIGEM_QUALIFICACAO, DEAL_FARMER_OVERRIDES,
  ORIGIN_OVERRIDE_DEAL_IDS, BONUS_DEALS, B2C_PIPELINE_IDS, WON_STAGES,
} from './constants'

export interface Deal {
  id: string
  name: string
  farmerId: string
  farmerName: string
  score: number
  criteria: string[]
  date: string           // pipedrive___data_de_qualificacao
  hubspotUrl: string
  pipeline: string
  closedLostReason: string
  motivoSinalizacaoPerda: string
  createDate: string     // createdate
  lastModifiedDate: string // hs_lastmodifieddate
  dealStage: string      // dealstage
  meetingScheduled: boolean  // tem reunião real associada no CRM (qualquer outcome)
  meetingCompleted: boolean  // tem reunião associada com hs_meeting_outcome=COMPLETED
  meetingNoShow: boolean     // tem reunião associada com hs_meeting_outcome=NO_SHOW
  ownerName: string      // hubspot_owner_id → owner display name
  isScored: boolean      // has pontuacao_leadscore — false = "Fora do SAL"
  companyId: string      // empresa associada (associação primária) — '' se nenhuma
  origemDoLead: string   // origem_do_lead
  origemQualificacao: string // origem_da_qualificacao
  ownerId: string        // hubspot_owner_id (raw)
  isNoShowExcluded: boolean  // B2C com No Show (sem realizada) → tratado como Fora do MOA
}

export interface FetchValidation {
  totalBruto: number
  excludedFora: number
  totalLiquido: number
}

export interface ForaDoMOAEntry {
  farmerName: string
  count: number
}

export interface ExcludedDeal {
  id: string
  name: string
  farmerId: string
  farmerName: string
  date: string
  hubspotUrl: string
  reason?: 'noshow' | 'fora_moa'
}

export interface FetchResult {
  deals: Deal[]
  validation: FetchValidation
  foraDoMOA: ForaDoMOAEntry[]
  excludedDeals: ExcludedDeal[]
  farmerRevenue: Map<string, number>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchWithRetry(url: string, init: RequestInit, retries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, init)
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('retry-after')
      const waitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, 200) : 200 * Math.pow(2, attempt)
      await sleep(waitMs)
      continue
    }
    return resp
  }
  return fetch(url, init)
}

function normalizeCriterionKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function matchCriteria(criteriosAtendidos: string | null | undefined): string[] {
  if (!criteriosAtendidos) return []

  const rawValues = criteriosAtendidos
    .split(/[;,|]/)
    .map((v) => v.trim())
    .filter(Boolean)

  const matched: string[] = []

  for (const rawValue of rawValues) {
    const normalized = normalizeCriterionKey(rawValue)

    for (const criterion of CRITERIA) {
      if (matched.includes(criterion.key)) continue

      const criterionNormalized = normalizeCriterionKey(criterion.key)

      if (normalized === criterionNormalized) {
        matched.push(criterion.key)
        break
      }

      const keyParts = criterionNormalized.split('_').filter((p) => p.length > 3)
      if (keyParts.some((part) => normalized.includes(part))) {
        matched.push(criterion.key)
        break
      }

      const valueParts = normalized.split('_').filter((p) => p.length > 3)
      if (valueParts.some((part) => criterionNormalized.includes(part))) {
        matched.push(criterion.key)
        break
      }
    }
  }

  return matched
}

function fieldContainsForaMOA(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = normalizeCriterionKey(value)
  return normalized.includes('fora') && normalized.includes('moa')
}

function isForaDoMOA(deal: { closedLostReason: string; motivoSinalizacaoPerda: string }): boolean {
  return fieldContainsForaMOA(deal.closedLostReason) ||
    fieldContainsForaMOA(deal.motivoSinalizacaoPerda)
}

async function fetchOwnerMap(pat: string): Promise<Record<string, string>> {
  const resp = await fetchWithRetry('https://api.hubapi.com/crm/v3/owners?limit=200', {
    headers: { Authorization: `Bearer ${pat}` },
    cache: 'no-store',
  })
  if (!resp.ok) return {}
  const data = await resp.json() as {
    results?: Array<{ id: string; firstName?: string; lastName?: string; email?: string }>
  }
  const map: Record<string, string> = {}
  for (const o of data.results ?? []) {
    const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email || o.id
    map[o.id] = name
  }
  return map
}

export interface MeetingStatus {
  scheduled: boolean  // tem ≥1 reunião associada (qualquer outcome)
  completed: boolean  // tem ≥1 reunião com outcome COMPLETED
  noShow: boolean     // tem ≥1 reunião com outcome NO_SHOW
}

async function fetchMeetingStatusByDeal(pat: string, dealIds: string[]): Promise<Map<string, MeetingStatus>> {
  const status = new Map<string, MeetingStatus>()
  if (dealIds.length === 0) return status

  const CHUNK = 100

  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK)

    if (i > 0) await sleep(150)
    // Step 1: get meeting IDs associated with each deal
    const assocResp = await fetchWithRetry('https://api.hubapi.com/crm/v4/associations/deals/meetings/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    })
    if (!assocResp.ok) continue

    const assocData = await assocResp.json() as {
      results?: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }>
    }

    const dealByMeeting: Record<string, string> = {}
    const meetingIds: string[] = []
    for (const row of assocData.results ?? []) {
      // qualquer reunião associada = agendada
      const prev = status.get(row.from.id)
      status.set(row.from.id, { scheduled: true, completed: prev?.completed ?? false, noShow: prev?.noShow ?? false })
      for (const t of row.to ?? []) {
        const mid = String(t.toObjectId)
        dealByMeeting[mid] = row.from.id
        meetingIds.push(mid)
      }
    }
    if (meetingIds.length === 0) continue

    // Step 2: batch read meeting outcomes → marca realizadas
    const meetResp = await fetchWithRetry('https://api.hubapi.com/crm/v3/objects/meetings/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: meetingIds.map((id) => ({ id })),
        properties: ['hs_meeting_outcome', 'hs_meeting_start_time'],
      }),
    })
    if (!meetResp.ok) continue

    const now = Date.now()
    const meetData = await meetResp.json() as {
      results?: Array<{ id: string; properties: { hs_meeting_outcome?: string; hs_meeting_start_time?: string } }>
    }
    for (const m of meetData.results ?? []) {
      const dealId = dealByMeeting[m.id]
      if (!dealId) continue
      const prev = status.get(dealId)
      const outcome = m.properties.hs_meeting_outcome ?? ''
      if (outcome === 'COMPLETED') {
        status.set(dealId, { scheduled: true, completed: true, noShow: prev?.noShow ?? false })
      } else if (outcome === 'NO_SHOW') {
        status.set(dealId, { scheduled: true, completed: prev?.completed ?? false, noShow: true })
      } else if (!outcome || outcome === 'SCHEDULED') {
        // Sem outcome ou SCHEDULED mas já passou → considerar realizada
        const startRaw = m.properties.hs_meeting_start_time ?? ''
        const startMs = startRaw ? (/^\d+$/.test(startRaw) ? parseInt(startRaw, 10) : new Date(startRaw).getTime()) : 0
        if (startMs > 0 && startMs < now) {
          status.set(dealId, { scheduled: true, completed: true, noShow: prev?.noShow ?? false })
        }
      }
    }
  }

  return status
}

async function fetchCompanyIdByDeal(pat: string, dealIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (dealIds.length === 0) return map

  const CHUNK = 100

  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK)

    if (i > 0) await sleep(150)
    const resp = await fetchWithRetry('https://api.hubapi.com/crm/v4/associations/deals/companies/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    })
    if (!resp.ok) continue

    const data = await resp.json() as {
      results?: Array<{
        from: { id: string }
        to: Array<{ toObjectId: number | string; associationTypes?: Array<{ label?: string | null }> }>
      }>
    }

    for (const row of data.results ?? []) {
      const tos = row.to ?? []
      if (tos.length === 0) continue
      // prefere a associação "Primary"; senão pega a primeira
      const primary = tos.find((t) => t.associationTypes?.some((a) => a.label === 'Primary')) ?? tos[0]
      map.set(row.from.id, String(primary.toObjectId))
    }
  }

  return map
}

export async function fetchAllDeals(): Promise<FetchResult> {
  const pat = process.env.HUBSPOT_TOKEN
  if (!pat) throw new Error('HUBSPOT_TOKEN environment variable is not set')

  const [farmerIds, ownerMap] = await Promise.all([
    Promise.resolve(Object.keys(FARMERS)),
    fetchOwnerMap(pat),
  ])
  const rawDeals: Deal[] = []
  let after: string | undefined = undefined

  function buildBody(cursor?: string): string {
    const payload: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'sdrfarmer_responsavel',
              operator: 'IN',
              values: farmerIds,
            },
            {
              propertyName: 'pipedrive___data_de_qualificacao',
              operator: 'GTE',
              value: '1767225600000', // 2026-01-01
            },
          ],
        },
      ],
      properties: [
        'dealname',
        'sdrfarmer_responsavel',
        'pontuacao_leadscore',
        'criterios_atendidos',
        'pipedrive___data_de_qualificacao',
        'pipeline',
        'closed_lost_reason',
        'motivo_de_sinalizacao_de_perda',
        'createdate',
        'hs_lastmodifieddate',
        'dealstage',
        'conseguiu_agendar_a_meet_',
        'hubspot_owner_id',
        'origem_do_lead',
        'origem_da_qualificacao',
      ],
      limit: 200,
    }
    if (cursor) payload.after = cursor
    return JSON.stringify(payload)
  }

  while (true) {
    if (after) await sleep(150)
    const resp = await fetchWithRetry('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: buildBody(after),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`HubSpot API error: ${resp.status} - ${errText}`)
    }

    const data = await resp.json() as {
      results?: Array<{ id: string; properties: Record<string, string> }>
      paging?: { next?: { after?: string } }
    }

    for (const deal of (data.results ?? [])) {
      const props = deal.properties ?? {}
      const rawFarmerId = props.sdrfarmer_responsavel ?? ''
      const farmerId = FARMER_ALIASES[rawFarmerId] ?? rawFarmerId
      const rawDate = props.pipedrive___data_de_qualificacao ?? ''
      // HubSpot retorna "YYYY-MM-DD" ou ms timestamp.
      // Armazenamos ao meio-dia UTC (T12:00:00Z) para que o browser
      // em qualquer timezone (incluindo BRT UTC-3) exiba o dia correto.
      let dateIso = ''
      if (rawDate) {
        if (/^\d{10,}$/.test(rawDate)) {
          // ms timestamp → extrair YYYY-MM-DD e fixar ao meio-dia UTC
          const d = new Date(parseInt(rawDate, 10))
          const ymd = d.toISOString().slice(0, 10)
          dateIso = `${ymd}T12:00:00.000Z`
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          // string de data — fixar ao meio-dia UTC diretamente
          dateIso = `${rawDate}T12:00:00.000Z`
        } else {
          dateIso = new Date(rawDate).toISOString()
        }
      }

      rawDeals.push({
        id: deal.id,
        name: props.dealname ?? `Deal ${deal.id}`,
        farmerId,
        farmerName: FARMERS[farmerId] ?? farmerId,
        score: parseFloat(props.pontuacao_leadscore ?? '0') || 0,
        criteria: matchCriteria(props.criterios_atendidos),
        date: dateIso,
        hubspotUrl: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${deal.id}`,
        pipeline: props.pipeline ?? '',
        closedLostReason: props.closed_lost_reason ?? '',
        motivoSinalizacaoPerda: props.motivo_de_sinalizacao_de_perda ?? '',
        createDate: props.createdate ? new Date(props.createdate).toISOString() : '',
        lastModifiedDate: props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).toISOString() : '',
        dealStage: props.dealstage ?? '',
        meetingScheduled: false,  // preenchido via fetchMeetingStatusByDeal
        meetingCompleted: false,  // preenchido via fetchMeetingStatusByDeal
        meetingNoShow: false,
        ownerName: ownerMap[props.hubspot_owner_id ?? ''] ?? '',
        isScored: !!props.pontuacao_leadscore,
        companyId: '',            // preenchido via fetchCompanyIdByDeal
        origemDoLead: props.origem_do_lead ?? '',
        origemQualificacao: props.origem_da_qualificacao ?? '',
        ownerId: props.hubspot_owner_id ?? '',
        isNoShowExcluded: false,
      })
    }

    const nextAfter = data.paging?.next?.after
    if (!nextAfter) break
    after = nextAfter
  }

  // Fetch deal overrides that weren't captured by the main query
  const fetchedIds = new Set(rawDeals.map((d) => d.id))
  const overrideIds = Object.keys(DEAL_FARMER_OVERRIDES).filter((id) => !fetchedIds.has(id))
  if (overrideIds.length > 0) {
    const overrideResp = await fetchWithRetry('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: overrideIds.map((id) => ({ id })),
        properties: [
          'dealname', 'sdrfarmer_responsavel', 'pontuacao_leadscore', 'criterios_atendidos',
          'pipedrive___data_de_qualificacao', 'pipeline', 'closed_lost_reason', 'motivo_de_sinalizacao_de_perda', 'createdate',
          'hs_lastmodifieddate', 'dealstage', 'hubspot_owner_id', 'origem_do_lead', 'origem_da_qualificacao',
        ],
      }),
    })
    if (overrideResp.ok) {
      const overrideData = await overrideResp.json() as { results?: Array<{ id: string; properties: Record<string, string> }> }
      for (const deal of overrideData.results ?? []) {
        const props = deal.properties ?? {}
        const overrideFarmerId = DEAL_FARMER_OVERRIDES[deal.id]
        const rawDate = props.pipedrive___data_de_qualificacao ?? ''
        let dateIso = ''
        if (rawDate) {
          if (/^\d{10,}$/.test(rawDate)) {
            const d = new Date(parseInt(rawDate, 10))
            dateIso = `${d.toISOString().slice(0, 10)}T12:00:00.000Z`
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            dateIso = `${rawDate}T12:00:00.000Z`
          } else {
            dateIso = new Date(rawDate).toISOString()
          }
        }
        rawDeals.push({
          id: deal.id,
          name: props.dealname ?? `Deal ${deal.id}`,
          farmerId: overrideFarmerId,
          farmerName: FARMERS[overrideFarmerId] ?? overrideFarmerId,
          score: parseFloat(props.pontuacao_leadscore ?? '0') || 0,
          criteria: matchCriteria(props.criterios_atendidos),
          date: dateIso,
          hubspotUrl: `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-3/${deal.id}`,
          pipeline: props.pipeline ?? '',
          closedLostReason: props.closed_lost_reason ?? '',
          motivoSinalizacaoPerda: props.motivo_de_sinalizacao_de_perda ?? '',
          createDate: props.createdate ? new Date(props.createdate).toISOString() : '',
          lastModifiedDate: props.hs_lastmodifieddate ? new Date(props.hs_lastmodifieddate).toISOString() : '',
          dealStage: props.dealstage ?? '',
          meetingScheduled: false,
          meetingCompleted: false,
          meetingNoShow: false,
          ownerName: ownerMap[props.hubspot_owner_id ?? ''] ?? '',
          isScored: !!props.pontuacao_leadscore,
          companyId: '',
          origemDoLead: props.origem_do_lead ?? '',
          origemQualificacao: props.origem_da_qualificacao ?? '',
          ownerId: props.hubspot_owner_id ?? '',
          isNoShowExcluded: false,
        })
      }
    }
  }

  // Also reassign farmer for override deals that WERE in the main query
  for (const d of rawDeals) {
    const overrideFarmer = DEAL_FARMER_OVERRIDES[d.id]
    if (overrideFarmer) {
      d.farmerId = overrideFarmer
      d.farmerName = FARMERS[overrideFarmer] ?? overrideFarmer
    }
  }

  // Apply per-farmer date restrictions (fromDate / untilDate)
  const originCutover = new Date(ORIGIN_CUTOVER).getTime()
  const restrictedRaw = rawDeals.filter((d) => {
    const restriction = FARMER_DATE_RESTRICTIONS[d.farmerId]
    if (d.date && restriction) {
      const ts = new Date(d.date).getTime()
      if (restriction.fromDate && ts < new Date(restriction.fromDate).getTime()) return false
      if (restriction.untilDate && ts >= new Date(restriction.untilDate).getTime()) return false
      if (restriction.excludeRange) {
        const from = new Date(restriction.excludeRange.from).getTime()
        const until = new Date(restriction.excludeRange.until).getTime()
        if (ts >= from && ts < until) return false
      }
    }
    // Filtro de origem: vale só de ORIGIN_CUTOVER (jul/26) em diante.
    // Histórico mantém todas as origens.
    if (d.date && new Date(d.date).getTime() >= originCutover && !ORIGIN_OVERRIDE_DEAL_IDS.has(d.id)) {
      const okLead = ALLOWED_ORIGEM_DO_LEAD.includes(d.origemDoLead)
      const okQual = ALLOWED_ORIGEM_QUALIFICACAO.includes(d.origemQualificacao)
      if (!okLead && !okQual) return false
    }
    return true
  })
  rawDeals.length = 0
  restrictedRaw.forEach((d) => rawDeals.push(d))

  // Busca reuniões reais e empresa associada para TODOS os negócios (em paralelo)
  const allDealIds = rawDeals.map((d) => d.id)
  const [meetingStatus, companyByDeal] = await Promise.all([
    fetchMeetingStatusByDeal(pat, allDealIds),
    fetchCompanyIdByDeal(pat, allDealIds),
  ])
  for (const d of rawDeals) {
    const ms = meetingStatus.get(d.id)
    if (ms) {
      d.meetingScheduled = ms.scheduled
      d.meetingCompleted = ms.completed
      d.meetingNoShow = ms.noShow
    }
    d.companyId = companyByDeal.get(d.id) ?? ''
  }

  // B2C com No Show (sem reunião realizada) → tratar como Fora do MOA
  for (const d of rawDeals) {
    if (B2C_PIPELINE_IDS.has(d.pipeline) && d.meetingNoShow && !d.meetingCompleted) {
      d.isNoShowExcluded = true
    }
  }

  const totalBruto = rawDeals.length
  const excluded = rawDeals.filter((d) => isForaDoMOA(d) || d.isNoShowExcluded)
  const excludedFora = excluded.length
  const deals = rawDeals.filter((d) => !isForaDoMOA(d) && !d.isNoShowExcluded)

  // Deals bônus: duplica deals recuperados que converteram em venda
  const dealById = new Map(deals.map((d) => [d.id, d]))
  for (const bonus of BONUS_DEALS) {
    const original = dealById.get(bonus.dealId)
    if (!original) continue
    const farmerId = FARMER_ALIASES[bonus.farmerId] ?? bonus.farmerId
    deals.push({
      ...original,
      id: `${original.id}_bonus`,
      farmerId,
      farmerName: FARMERS[farmerId] ?? farmerId,
      date: `${bonus.date}T12:00:00.000Z`,
    })
  }

  const excludedDeals: ExcludedDeal[] = excluded.map((d) => ({
    id: d.id,
    name: d.name,
    farmerId: d.farmerId,
    farmerName: d.farmerName,
    date: d.date,
    hubspotUrl: d.hubspotUrl,
    reason: d.isNoShowExcluded ? 'noshow' as const : 'fora_moa' as const,
  }))

  // Group excluded deals by farmer (global, unfiltered — used as fallback)
  const foraByFarmer: Record<string, number> = {}
  for (const d of excluded) {
    foraByFarmer[d.farmerName] = (foraByFarmer[d.farmerName] ?? 0) + 1
  }
  const foraDoMOA = Object.entries(foraByFarmer)
    .map(([farmerName, count]) => ({ farmerName, count }))
    .sort((a, b) => b.count - a.count)

  // Receita: busca deals ganhos por closedate (independente da qualificação)
  const farmerRevenue = new Map<string, number>()
  const farmerIdsArray = Object.keys(FARMERS)
  let wonAfter: string | undefined
  while (true) {
    if (wonAfter) await sleep(150)
    const wonBody: Record<string, unknown> = {
      filterGroups: [{
        filters: [
          { propertyName: 'sdrfarmer_responsavel', operator: 'IN', values: farmerIdsArray },
          { propertyName: 'dealstage', operator: 'IN', values: WON_STAGES },
          { propertyName: 'closedate', operator: 'GTE', value: '1767225600000' },
        ],
      }],
      properties: ['sdrfarmer_responsavel', 'amount_in_home_currency', 'closedate'],
      limit: 200,
    }
    if (wonAfter) wonBody.after = wonAfter
    const wonResp = await fetchWithRetry('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(wonBody),
    })
    if (!wonResp.ok) break
    const wonData = await wonResp.json() as {
      results?: Array<{ id: string; properties: Record<string, string> }>
      paging?: { next?: { after?: string } }
    }
    for (const r of wonData.results ?? []) {
      const fid = FARMER_ALIASES[r.properties.sdrfarmer_responsavel ?? ''] ?? (r.properties.sdrfarmer_responsavel ?? '')
      if (!FARMERS[fid]) continue
      const amount = parseFloat(r.properties.amount_in_home_currency ?? '0') || 0
      const closeDate = r.properties.closedate ?? ''
      farmerRevenue.set(`${fid}:${closeDate}:${r.id}`, amount)
    }
    wonAfter = wonData.paging?.next?.after
    if (!wonAfter) break
  }
  // Aggregate by farmer
  const revenueByFarmer = new Map<string, number>()
  for (const [key, amount] of farmerRevenue) {
    const fid = key.split(':')[0]
    revenueByFarmer.set(fid, (revenueByFarmer.get(fid) ?? 0) + amount)
  }

  return {
    deals,
    validation: { totalBruto, excludedFora, totalLiquido: deals.length },
    foraDoMOA,
    excludedDeals,
    farmerRevenue: revenueByFarmer,
  }
}
