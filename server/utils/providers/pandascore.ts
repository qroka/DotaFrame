import { z } from 'zod'

export const pandaScoreListStatusSchema = z.enum(['upcoming', 'running', 'past'])
export type PandaScoreListStatus = z.infer<typeof pandaScoreListStatusSchema>

const nullableDate = z.string().nullable().optional()
const rawTeamSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().trim().min(1),
  acronym: z.string().nullable().optional(),
  image_url: z.string().nullable().optional()
}).passthrough()

const rawOpponentSchema = z.object({ opponent: rawTeamSchema.nullable().optional() }).passthrough()
const rawResultSchema = z.object({
  team_id: z.union([z.string(), z.number()]),
  score: z.number().int().nonnegative().default(0)
}).passthrough()
const rawGameSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string(),
  position: z.number().int().positive().nullable().optional(),
  winner_id: z.union([z.string(), z.number()]).nullable().optional(),
  // PandaScore sends `winner: { id: null, type: "Team" }` for games that have not been played yet.
  winner: z.object({ id: z.union([z.string(), z.number()]).nullable().optional() }).passthrough().nullable().optional(),
  begin_at: nullableDate,
  end_at: nullableDate
}).passthrough()

export const pandaScoreRawMatchSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().default(''),
  status: z.string(),
  scheduled_at: nullableDate,
  begin_at: nullableDate,
  end_at: nullableDate,
  number_of_games: z.number().int().nullable().optional(),
  opponents: z.array(rawOpponentSchema).default([]),
  results: z.array(rawResultSchema).default([]),
  winner_id: z.union([z.string(), z.number()]).nullable().optional(),
  games: z.array(rawGameSchema).default([]),
  tournament: z.object({ id: z.union([z.string(), z.number()]), name: z.string().default('') }).passthrough(),
  league: z.object({ id: z.union([z.string(), z.number()]).optional(), name: z.string().default('') }).passthrough().nullable().optional()
}).passthrough()

export const externalTeamSchema = z.object({
  externalId: z.string(), name: z.string(), shortName: z.string().nullable(), logoUrl: z.string().nullable()
})
export const externalGameSchema = z.object({
  externalId: z.string(), mapNumber: z.number().int().positive(),
  status: z.enum(['scheduled', 'live', 'completed', 'cancelled']),
  winnerExternalTeamId: z.string().nullable(), beginAt: z.string().nullable(), endAt: z.string().nullable()
})
export const externalMatchSchema = z.object({
  provider: z.literal('pandascore'), externalId: z.string(), name: z.string(),
  status: z.enum(['scheduled', 'live', 'completed', 'cancelled']),
  scheduledAt: z.string().nullable(), beginAt: z.string().nullable(), endAt: z.string().nullable(),
  format: z.enum(['BO1', 'BO2', 'BO3', 'BO5']),
  tournament: z.object({ externalId: z.string(), name: z.string(), leagueName: z.string() }),
  teamA: externalTeamSchema.nullable(), teamB: externalTeamSchema.nullable(),
  scoreA: z.number().int().nonnegative(), scoreB: z.number().int().nonnegative(),
  winnerExternalTeamId: z.string().nullable(), games: z.array(externalGameSchema)
})
export type ExternalMatch = z.infer<typeof externalMatchSchema>

export const pandaScoreImportSchema = z.object({
  externalMatchId: z.string().trim().min(1).max(80),
  teamMappings: z.array(z.object({ externalId: z.string().min(1), localId: z.string().min(1) })).max(2).default([])
})

export type NormalizedStatus = ExternalMatch['status']

export function normalizePandaScoreStatus(status: string): NormalizedStatus {
  if (status === 'not_started') return 'scheduled'
  if (status === 'running') return 'live'
  if (status === 'finished') return 'completed'
  if (status === 'canceled' || status === 'cancelled') return 'cancelled'
  return 'scheduled'
}

export function normalizeBestOf(games: number | null | undefined): ExternalMatch['format'] {
  if (games === 1) return 'BO1'
  if (games === 2) return 'BO2'
  if (games === 5) return 'BO5'
  return 'BO3'
}

const textId = (value: string | number | null | undefined) => value == null ? null : String(value)
const iso = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null

function normalizeTeam(value: z.infer<typeof rawTeamSchema> | null | undefined) {
  if (!value) return null
  return externalTeamSchema.parse({
    externalId: String(value.id), name: value.name,
    shortName: value.acronym?.trim() || null,
    logoUrl: value.image_url?.trim() || null
  })
}

export function normalizePandaScoreMatch(input: unknown): ExternalMatch {
  const raw = pandaScoreRawMatchSchema.parse(input)
  const teamA = normalizeTeam(raw.opponents[0]?.opponent)
  const teamB = normalizeTeam(raw.opponents[1]?.opponent)
  const scores = new Map(raw.results.map(result => [String(result.team_id), result.score]))
  const status = normalizePandaScoreStatus(raw.status)
  const winnerExternalTeamId = status === 'completed' ? textId(raw.winner_id) : null
  return externalMatchSchema.parse({
    provider: 'pandascore', externalId: String(raw.id), name: raw.name,
    status, scheduledAt: iso(raw.scheduled_at), beginAt: iso(raw.begin_at), endAt: iso(raw.end_at),
    format: normalizeBestOf(raw.number_of_games),
    tournament: {
      externalId: String(raw.tournament.id),
      name: raw.tournament.name || raw.name || 'Dota 2',
      leagueName: raw.league?.name || ''
    },
    teamA, teamB,
    scoreA: teamA ? scores.get(teamA.externalId) ?? 0 : 0,
    scoreB: teamB ? scores.get(teamB.externalId) ?? 0 : 0,
    winnerExternalTeamId,
    games: raw.games.map((game, index) => {
      const gameStatus = normalizePandaScoreStatus(game.status)
      return {
        externalId: String(game.id), mapNumber: game.position ?? index + 1, status: gameStatus,
        winnerExternalTeamId: gameStatus === 'completed' ? textId(game.winner_id ?? game.winner?.id) : null,
        beginAt: iso(game.begin_at), endAt: iso(game.end_at)
      }
    }).sort((a, b) => a.mapNumber - b.mapNumber)
  })
}

export type PandaScoreErrorCode = 'missing_token' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'timeout' | 'network' | 'invalid_response' | 'not_found'

export class PandaScoreError extends Error {
  constructor(public code: PandaScoreErrorCode, message: string, public retryAfter: string | null = null) {
    super(message)
    this.name = 'PandaScoreError'
  }
}

interface FetchOptions {
  token: string | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
  force?: boolean
  baseUrl?: string
}

/** GET a PandaScore list endpoint (path relative to the API root, may include a query) and return its JSON array. */
async function requestPandaScoreList(path: string, options: FetchOptions): Promise<unknown[]> {
  const token = options.token?.trim()
  if (!token) throw new PandaScoreError('missing_token', 'PANDASCORE_TOKEN не настроен')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
  let response: Response
  try {
    const baseUrl = (options.baseUrl || process.env.PANDASCORE_BASE_URL || 'https://api.pandascore.co').replace(/\/$/, '')
    response = await (options.fetchImpl ?? fetch)(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal
    })
  } catch (cause) {
    if (controller.signal.aborted) throw new PandaScoreError('timeout', 'PandaScore не ответил вовремя')
    throw new PandaScoreError('network', cause instanceof Error ? cause.message : 'Сетевая ошибка PandaScore')
  } finally { clearTimeout(timer) }
  if (response.status === 401) throw new PandaScoreError('unauthorized', 'PandaScore отклонил токен')
  if (response.status === 403) throw new PandaScoreError('forbidden', 'Текущий тариф PandaScore не разрешает этот запрос')
  if (response.status === 429) throw new PandaScoreError('rate_limited', 'Превышен лимит запросов PandaScore', response.headers.get('retry-after'))
  if (!response.ok) throw new PandaScoreError('network', `PandaScore вернул HTTP ${response.status}`)
  let body: unknown
  try { body = await response.json() } catch { throw new PandaScoreError('invalid_response', 'PandaScore вернул некорректный JSON') }
  if (!Array.isArray(body)) throw new PandaScoreError('invalid_response', 'PandaScore вернул неожиданный формат данных')
  return body
}

const cache = new Map<PandaScoreListStatus, { expiresAt: number, data: ExternalMatch[] }>()
export async function fetchPandaScoreMatches(status: PandaScoreListStatus, options: FetchOptions): Promise<ExternalMatch[]> {
  if (!options.token?.trim()) throw new PandaScoreError('missing_token', 'PANDASCORE_TOKEN не настроен')
  const cached = cache.get(status)
  if (!options.force && cached && cached.expiresAt > Date.now()) return structuredClone(cached.data)
  const body = await requestPandaScoreList(`/dota2/matches/${status}`, options)
  const data: ExternalMatch[] = []
  for (const item of body) {
    try { data.push(normalizePandaScoreMatch(item)) } catch { /* One malformed match must not break the list. */ }
  }
  cache.set(status, { expiresAt: Date.now() + 45_000, data })
  return structuredClone(data)
}

export const externalTeamDetailsSchema = externalTeamSchema.extend({ location: z.string().nullable() })
export type ExternalTeamDetails = z.infer<typeof externalTeamDetailsSchema>

export const pandaScoreTeamsQuerySchema = z.object({ search: z.string().trim().max(80).default('') })
export const pandaScoreTeamsImportSchema = z.object({
  externalIds: z.array(z.string().regex(/^\d+$/, 'Некорректный идентификатор команды PandaScore')).min(1, 'Выберите хотя бы одну команду').max(50, 'За один раз можно импортировать не более 50 команд')
})

export function normalizePandaScoreTeam(input: unknown): ExternalTeamDetails {
  const raw = rawTeamSchema.extend({ location: z.string().nullable().optional() }).parse(input)
  return externalTeamDetailsSchema.parse({
    externalId: String(raw.id), name: raw.name.trim(),
    shortName: raw.acronym?.trim() || null,
    logoUrl: raw.image_url?.trim() || null,
    location: raw.location?.trim() || null
  })
}

function normalizeTeamList(body: unknown[]) {
  const teams: ExternalTeamDetails[] = []
  for (const item of body) {
    try { teams.push(normalizePandaScoreTeam(item)) } catch { /* Skip malformed team records. */ }
  }
  return teams
}

/** Search the PandaScore Dota 2 team catalogue by name. */
export async function searchPandaScoreTeams(search: string, options: FetchOptions): Promise<ExternalTeamDetails[]> {
  const query = new URLSearchParams({ 'search[name]': search, per_page: '50', sort: 'name' })
  return normalizeTeamList(await requestPandaScoreList(`/dota2/teams?${query}`, options))
}

/** Load full team records (with region) for the given PandaScore team ids. */
export async function fetchPandaScoreTeamsByIds(externalIds: string[], options: FetchOptions): Promise<ExternalTeamDetails[]> {
  if (!externalIds.length) return []
  const query = new URLSearchParams({ 'filter[id]': externalIds.join(','), per_page: '100' })
  return normalizeTeamList(await requestPandaScoreList(`/dota2/teams?${query}`, options))
}

/** Teams that play in live and upcoming matches, ordered by the nearest match. */
export async function fetchActivePandaScoreTeams(options: FetchOptions): Promise<ExternalTeamDetails[]> {
  const [running, upcoming] = await Promise.all([fetchPandaScoreMatches('running', options), fetchPandaScoreMatches('upcoming', options)])
  const seen = new Map<string, ExternalTeamDetails>()
  for (const match of [...running, ...upcoming]) {
    for (const team of [match.teamA, match.teamB]) {
      if (team && !seen.has(team.externalId)) seen.set(team.externalId, { ...team, location: null })
    }
  }
  if (!seen.size) return []
  // Match payloads omit the team region, so enrich it with one catalogue request.
  const details = await fetchPandaScoreTeamsByIds([...seen.keys()], options).catch(() => [])
  for (const team of details) if (seen.has(team.externalId)) seen.set(team.externalId, team)
  return [...seen.values()]
}

/* ---------- Tournaments (PandaScore "series": a league season such as "The International 2026") ---------- */

const TIERS = ['S', 'A', 'B', 'C', 'D'] as const
export const externalTournamentSchema = z.object({
  externalId: z.string(), name: z.string(), league: z.string(), tier: z.enum(['', ...TIERS]),
  startDate: z.string().nullable(), endDate: z.string().nullable(), logoUrl: z.string().nullable()
})
export type ExternalTournament = z.infer<typeof externalTournamentSchema>

export const pandaScoreTournamentsQuerySchema = z.object({
  status: pandaScoreListStatusSchema.default('running'),
  search: z.string().trim().max(80).default('')
})
export const pandaScoreTournamentsImportSchema = z.object({
  externalIds: z.array(z.string().regex(/^\d+$/, 'Некорректный идентификатор турнира PandaScore')).min(1, 'Выберите хотя бы один турнир').max(50, 'За один раз можно импортировать не более 50 турниров')
})

const rawSerieSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  begin_at: nullableDate,
  end_at: nullableDate,
  league: z.object({ name: z.string().nullable().optional(), image_url: z.string().nullable().optional() }).passthrough().nullable().optional(),
  tournaments: z.array(z.object({ tier: z.string().nullable().optional() }).passthrough()).nullable().optional()
}).passthrough()

const dateOnly = (value: string | null | undefined) => iso(value)?.slice(0, 10) ?? null

/** Best (highest) tier among the stages; PandaScore marks tiers per stage, not per series. */
function serieTier(stages: Array<{ tier?: string | null }> | null | undefined): ExternalTournament['tier'] {
  const tiers = (stages ?? []).map(stage => stage.tier?.trim().toUpperCase()).filter((tier): tier is typeof TIERS[number] => (TIERS as readonly string[]).includes(tier ?? ''))
  return tiers.sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0] ?? ''
}

export function normalizePandaScoreSerie(input: unknown): ExternalTournament {
  const raw = rawSerieSchema.parse(input)
  const league = raw.league?.name?.trim() || ''
  const season = raw.full_name?.trim() || raw.name?.trim() || ''
  const name = [league, season].filter(Boolean).join(' ') || `PandaScore ${raw.id}`
  return externalTournamentSchema.parse({
    externalId: String(raw.id), name: name.slice(0, 120), league: league.slice(0, 80), tier: serieTier(raw.tournaments),
    startDate: dateOnly(raw.begin_at), endDate: dateOnly(raw.end_at), logoUrl: raw.league?.image_url?.trim() || null
  })
}

function normalizeSerieList(body: unknown[]) {
  const tournaments: ExternalTournament[] = []
  for (const item of body) {
    try { tournaments.push(normalizePandaScoreSerie(item)) } catch { /* Skip malformed series. */ }
  }
  return tournaments
}

/** Running, upcoming or past tournaments; `search` matches league and season names via the series slug. */
export async function fetchPandaScoreTournaments(status: PandaScoreListStatus, search: string, options: FetchOptions): Promise<ExternalTournament[]> {
  const slug = search.toLocaleLowerCase('en').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const query = new URLSearchParams({ per_page: '50' })
  if (slug) {
    query.set('search[slug]', slug)
    query.set('sort', '-begin_at')
    return normalizeSerieList(await requestPandaScoreList(`/dota2/series?${query}`, options))
  }
  query.set('sort', status === 'past' ? '-end_at' : 'begin_at')
  return normalizeSerieList(await requestPandaScoreList(`/dota2/series/${status}?${query}`, options))
}

export async function fetchPandaScoreTournamentsByIds(externalIds: string[], options: FetchOptions): Promise<ExternalTournament[]> {
  if (!externalIds.length) return []
  const query = new URLSearchParams({ 'filter[id]': externalIds.join(','), per_page: '100' })
  return normalizeSerieList(await requestPandaScoreList(`/dota2/series?${query}`, options))
}

export async function findPandaScoreMatch(externalMatchId: string, options: FetchOptions): Promise<ExternalMatch> {
  const results = await Promise.allSettled((['running', 'upcoming', 'past'] as const).map(status => fetchPandaScoreMatches(status, options)))
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const match = result.value.find(item => item.externalId === externalMatchId)
    if (match) return match
  }
  const error = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason
  if (results.every(result => result.status === 'rejected') && error) throw error
  throw new PandaScoreError('not_found', 'Матч PandaScore не найден в доступных списках')
}

export function clearPandaScoreCache() { cache.clear() }

export function pandaScoreHttpError(error: unknown) {
  if (!(error instanceof PandaScoreError)) return { statusCode: 502, statusMessage: 'Не удалось получить данные PandaScore' }
  const statusCode = error.code === 'missing_token' ? 503
    : error.code === 'unauthorized' ? 401
      : error.code === 'forbidden' ? 403
        : error.code === 'rate_limited' ? 429
          : error.code === 'not_found' ? 404
            : error.code === 'timeout' ? 504 : 502
  return { statusCode, statusMessage: error.message, data: { code: error.code, retryAfter: error.retryAfter } }
}
