import { z } from 'zod'
import type { ExternalMatch } from './pandascore'

const nullableText = z.string().nullable().optional()
const proMatchSchema = z.object({
  match_id: z.union([z.string(), z.number()]),
  start_time: z.number().int().nonnegative(),
  radiant_name: nullableText,
  dire_name: nullableText
}).passthrough()

const pickBanSchema = z.object({
  is_pick: z.boolean(), hero_id: z.number().int().positive(), team: z.number().int().min(0).max(1),
  order: z.number().int().nonnegative().optional()
}).passthrough()

const playerSchema = z.object({
  hero_id: z.number().int().nonnegative(), player_slot: z.number().int().nonnegative(),
  kills: z.number().int().optional(), deaths: z.number().int().optional(), assists: z.number().int().optional(),
  last_hits: z.number().int().optional(), denies: z.number().int().optional(), net_worth: z.number().int().optional(),
  gold_per_min: z.number().int().optional(), xp_per_min: z.number().int().optional(), level: z.number().int().optional(),
  hero_damage: z.number().int().optional(), tower_damage: z.number().int().optional(), hero_healing: z.number().int().optional(),
  personaname: nullableText, name: nullableText
}).passthrough()

const matchDetailSchema = z.object({
  match_id: z.union([z.string(), z.number()]), start_time: z.number().int().nonnegative(), duration: z.number().int().nonnegative().optional(),
  radiant_name: nullableText, dire_name: nullableText, radiant_win: z.boolean().nullable().optional(),
  radiant_score: z.number().int().nonnegative().optional(), dire_score: z.number().int().nonnegative().optional(),
  picks_bans: z.array(pickBanSchema).nullable().optional(), players: z.array(playerSchema).optional()
}).passthrough()
const explorerSchema = z.object({ rows: z.array(proMatchSchema) }).passthrough()

export interface OpenDotaEnrichment {
  externalId: string
  radiantExternalTeamId: string
  direExternalTeamId: string
  picksRadiant: number[]
  picksDire: number[]
  bansRadiant: number[]
  bansDire: number[]
  winner: 'radiant' | 'dire' | null
  stats: Record<string, unknown>
}

export interface OpenDotaOptions {
  apiKey?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  baseUrl?: string
}

export class OpenDotaError extends Error {
  constructor(public code: 'timeout' | 'network' | 'rate_limited' | 'invalid_response' | 'unauthorized', message: string) {
    super(message)
    this.name = 'OpenDotaError'
  }
}

const proCache = new Map<string, { expiresAt: number, data: z.infer<typeof proMatchSchema>[] }>()
const historyCache = new Map<string, { expiresAt: number, data: z.infer<typeof proMatchSchema>[] }>()
const normalizeName = (value: string | null | undefined) => (value || '').toLocaleLowerCase('en').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')
const asTime = (value: string | null | undefined) => value ? Date.parse(value) : Number.NaN

async function getJson(url: string, options: OpenDotaOptions) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
    if (response.status === 401 || response.status === 403) throw new OpenDotaError('unauthorized', 'OpenDota отклонил API key')
    if (response.status === 429) throw new OpenDotaError('rate_limited', 'Превышен лимит запросов OpenDota')
    if (!response.ok) throw new OpenDotaError('network', `OpenDota вернул HTTP ${response.status}`)
    try { return await response.json() } catch { throw new OpenDotaError('invalid_response', 'OpenDota вернул некорректный JSON') }
  } catch (cause) {
    if (cause instanceof OpenDotaError) throw cause
    if (controller.signal.aborted) throw new OpenDotaError('timeout', 'OpenDota не ответил вовремя')
    throw new OpenDotaError('network', cause instanceof Error ? cause.message : 'Сетевая ошибка OpenDota')
  } finally { clearTimeout(timer) }
}

async function getApiJson(path: string, options: OpenDotaOptions) {
  try { return await getJson(endpoint(path, options), options) }
  catch (cause) {
    if (!(cause instanceof OpenDotaError) || cause.code !== 'unauthorized' || !options.apiKey?.trim()) throw cause
    return await getJson(endpoint(path, { ...options, apiKey: '' }), { ...options, apiKey: '' })
  }
}

function endpoint(path: string, options: OpenDotaOptions) {
  const base = (options.baseUrl || process.env.OPENDOTA_BASE_URL || 'https://api.opendota.com/api').replace(/\/$/, '')
  const url = new URL(`${base}${path}`)
  if (options.apiKey?.trim()) url.searchParams.set('api_key', options.apiKey.trim())
  return url.toString()
}

async function proMatches(options: OpenDotaOptions) {
  const key = `${options.baseUrl || process.env.OPENDOTA_BASE_URL || 'default'}:${options.apiKey ? 'authenticated' : 'public'}`
  const cached = proCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.data)
  const parsed = z.array(proMatchSchema).safeParse(await getApiJson('/proMatches', options))
  if (!parsed.success) throw new OpenDotaError('invalid_response', 'OpenDota вернул неожиданный список матчей')
  proCache.set(key, { expiresAt: Date.now() + 60_000, data: parsed.data })
  return structuredClone(parsed.data)
}

function sqlText(value: string) { return value.slice(0, 100).replaceAll("'", "''") }

async function historicalMatches(match: ExternalMatch, options: OpenDotaOptions) {
  if (!match.teamA || !match.teamB) return []
  const anchor = asTime(match.beginAt || match.scheduledAt)
  if (!Number.isFinite(anchor)) return []
  const teamA = sqlText(match.teamA.name)
  const teamB = sqlText(match.teamB.name)
  const from = Math.floor(anchor / 1000) - 12 * 60 * 60
  const to = Math.floor(anchor / 1000) + 12 * 60 * 60
  const key = `${normalizeName(teamA)}:${normalizeName(teamB)}:${Math.floor(anchor / 86_400_000)}`
  const cached = historyCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.data)
  const sql = `SELECT m.match_id,m.start_time,tr.name AS radiant_name,td.name AS dire_name FROM matches m LEFT JOIN teams tr ON tr.team_id=m.radiant_team_id LEFT JOIN teams td ON td.team_id=m.dire_team_id WHERE m.start_time BETWEEN ${from} AND ${to} AND ((lower(tr.name)=lower('${teamA}') AND lower(td.name)=lower('${teamB}')) OR (lower(tr.name)=lower('${teamB}') AND lower(td.name)=lower('${teamA}'))) ORDER BY m.start_time LIMIT 20`
  const parsed = explorerSchema.safeParse(await getApiJson(`/explorer?sql=${encodeURIComponent(sql)}`, options))
  if (!parsed.success) throw new OpenDotaError('invalid_response', 'OpenDota Explorer вернул неожиданный ответ')
  historyCache.set(key, { expiresAt: Date.now() + 5 * 60_000, data: parsed.data.rows })
  return structuredClone(parsed.data.rows)
}

function sameTeams(candidate: z.infer<typeof proMatchSchema>, match: ExternalMatch) {
  if (!match.teamA || !match.teamB) return false
  const expected = [normalizeName(match.teamA.name), normalizeName(match.teamB.name)].sort().join(':')
  const actual = [normalizeName(candidate.radiant_name), normalizeName(candidate.dire_name)].sort().join(':')
  return !!expected && expected === actual
}

function playerStats(player: z.infer<typeof playerSchema>) {
  return {
    heroId: player.hero_id, playerSlot: player.player_slot, name: player.name || player.personaname || null,
    kills: player.kills ?? null, deaths: player.deaths ?? null, assists: player.assists ?? null,
    lastHits: player.last_hits ?? null, denies: player.denies ?? null, netWorth: player.net_worth ?? null,
    goldPerMinute: player.gold_per_min ?? null, xpPerMinute: player.xp_per_min ?? null, level: player.level ?? null,
    heroDamage: player.hero_damage ?? null, towerDamage: player.tower_damage ?? null, heroHealing: player.hero_healing ?? null
  }
}

export async function findOpenDotaGame(match: ExternalMatch, game: ExternalMatch['games'][number], options: OpenDotaOptions = {}): Promise<OpenDotaEnrichment | null> {
  if (game.status !== 'completed' || !match.teamA || !match.teamB) return null
  const target = asTime(game.beginAt || match.beginAt || match.scheduledAt)
  if (!Number.isFinite(target)) return null
  let pool = await proMatches(options)
  if (!pool.some(candidate => sameTeams(candidate, match))) pool = await historicalMatches(match, options)
  const candidates = pool.filter(candidate => sameTeams(candidate, match))
    .map(candidate => ({ candidate, distance: Math.abs(candidate.start_time * 1000 - target) }))
    .filter(item => item.distance <= 6 * 60 * 60 * 1000).sort((a, b) => a.distance - b.distance)
  if (!candidates[0]) return null
  if (candidates[1] && Math.abs(candidates[1].distance - candidates[0].distance) < 10 * 60 * 1000) return null
  const parsed = matchDetailSchema.safeParse(await getApiJson(`/matches/${candidates[0].candidate.match_id}`, options))
  if (!parsed.success) throw new OpenDotaError('invalid_response', 'OpenDota вернул неожиданные данные карты')
  const detail = parsed.data
  const actions = [...(detail.picks_bans || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const picksRadiant = actions.filter(item => item.is_pick && item.team === 0).map(item => item.hero_id)
  const picksDire = actions.filter(item => item.is_pick && item.team === 1).map(item => item.hero_id)
  if (picksRadiant.length !== 5 || picksDire.length !== 5) return null
  const radiantName = normalizeName(detail.radiant_name || candidates[0].candidate.radiant_name)
  const teamAIsRadiant = radiantName === normalizeName(match.teamA.name)
  const radiantExternalTeamId = teamAIsRadiant ? match.teamA.externalId : match.teamB.externalId
  const direExternalTeamId = teamAIsRadiant ? match.teamB.externalId : match.teamA.externalId
  return {
    externalId: String(detail.match_id), radiantExternalTeamId, direExternalTeamId,
    picksRadiant, picksDire,
    bansRadiant: actions.filter(item => !item.is_pick && item.team === 0).map(item => item.hero_id),
    bansDire: actions.filter(item => !item.is_pick && item.team === 1).map(item => item.hero_id),
    winner: detail.radiant_win == null ? null : detail.radiant_win ? 'radiant' : 'dire',
    stats: {
      provider: 'opendota', matchId: String(detail.match_id), startTime: new Date(detail.start_time * 1000).toISOString(),
      duration: detail.duration ?? null, radiantScore: detail.radiant_score ?? null, direScore: detail.dire_score ?? null,
      radiantWin: detail.radiant_win ?? null, players: (detail.players || []).map(playerStats)
    }
  }
}

export function clearOpenDotaCache() { proCache.clear(); historyCache.clear() }
