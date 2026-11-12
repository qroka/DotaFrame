import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { useDatabase, json } from './database'
import { repository } from './repository'
import type { ExternalMatch, ExternalTeamDetails, ExternalTournament } from './providers/pandascore'
import { findOpenDotaGame, type OpenDotaEnrichment } from './providers/opendota'
import { buildDraftData, buildMatchData } from '../../src/domain/snapshot.js'
import { HEROES_BY_ID } from '../../src/data/heroes.js'
import { defaultStyle, defaultTexts } from '../../src/templates/registry.js'
import announcementTemplate from '../../src/templates/announcement.js'
import draftTemplate from '../../src/templates/tpl-draft.js'
import seriesTemplate from '../../src/templates/tpl-series-result.js'
import winTemplate from '../../src/templates/tpl-win.js'
import loseTemplate from '../../src/templates/tpl-lose.js'

type Row = Record<string, unknown>
type FetchLike = typeof fetch
const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}_${randomUUID()}`

export const matchGameSchema = z.object({
  id: z.string(), matchId: z.string(), provider: z.literal('pandascore'), externalId: z.string(),
  mapNumber: z.number().int().positive(), status: z.enum(['scheduled', 'live', 'completed', 'cancelled']),
  winnerTeamId: z.string().nullable(), beginAt: z.string().nullable(), endAt: z.string().nullable(),
  statsProvider: z.string().nullable(), statsExternalId: z.string().nullable(), stats: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(), updatedAt: z.string()
})

export const packageItemSchema = z.object({
  key: z.string(), kind: z.enum(['announcement', 'draft', 'map-result', 'series-result', 'team-outcome']),
  title: z.string(), templateId: z.string(), mapNumber: z.number().int().positive().nullable(),
  gameId: z.string().nullable(), externalGameId: z.string().nullable(),
  status: z.enum(['ready', 'requires_input', 'waiting_for_game', 'waiting_for_series', 'unavailable', 'created']),
  reason: z.string().nullable(), projectId: z.string().nullable()
})

export const publicationPackageSchema = z.object({
  match: z.record(z.string(), z.unknown()),
  teams: z.array(z.record(z.string(), z.unknown())),
  games: z.array(matchGameSchema),
  trackedTeamId: z.string().nullable(),
  source: z.object({ provider: z.literal('pandascore'), externalId: z.string(), syncedAt: z.string() }),
  items: z.array(packageItemSchema)
})
export type PublicationPackage = z.infer<typeof publicationPackageSchema>

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const allowedLogoHosts = new Set(['cdn.pandascore.co', 'cdn-api.pandascore.co', 'img-cdn.pandascore.co'])

function validImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/png') return bytes[0]! === 0x89 && bytes[1]! === 0x50 && bytes[2]! === 0x4e && bytes[3]! === 0x47
  if (mimeType === 'image/jpeg') return bytes[0]! === 0xff && bytes[1]! === 0xd8 && bytes[2]! === 0xff
  if (mimeType === 'image/gif') return String.fromCharCode(...bytes.slice(0, 3)) === 'GIF'
  if (mimeType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

export async function downloadPandaScoreLogo(url: string, fetchImpl: FetchLike = fetch) {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('Некорректный URL логотипа') }
  if (parsed.protocol !== 'https:' || !allowedLogoHosts.has(parsed.hostname)) throw new Error('Домен логотипа не разрешён')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  let response: Response
  try { response = await fetchImpl(parsed, { signal: controller.signal, redirect: 'error' }) }
  finally { clearTimeout(timer) }
  if (!response.ok) throw new Error(`Логотип вернул HTTP ${response.status}`)
  const mimeType = ((response.headers.get('content-type') || '').split(';')[0] ?? '').trim().toLowerCase()
  if (!imageTypes.has(mimeType)) throw new Error('Логотип имеет неподдерживаемый Content-Type')
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > 5 * 1024 * 1024) throw new Error('Логотип больше 5 МБ')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Логотип пустой или слишком большой')
  if (!validImageSignature(bytes, mimeType)) throw new Error('Содержимое логотипа не соответствует формату')
  return { bytes, mimeType, name: `${parsed.pathname.split('/').pop() || 'pandascore-logo'}.${mimeType.split('/')[1]}` }
}

function externalRow(entityType: string, externalId: string) {
  return useDatabase().prepare('SELECT * FROM external_entities WHERE provider = ? AND entity_type = ? AND external_id = ?').get('pandascore', entityType, externalId) as Row | undefined
}

function externalMetadata(row: Row | undefined) {
  try { return row?.metadata_json ? json<Record<string, unknown>>(String(row.metadata_json)) : {} } catch { return {} }
}

function upsertExternal(entityType: 'team' | 'match' | 'game' | 'tournament', externalId: string, localId: string, syncedAt: string, metadata: Record<string, unknown> = {}) {
  useDatabase().prepare(`INSERT INTO external_entities(id,provider,entity_type,external_id,local_id,synced_at,metadata_json)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(provider,entity_type,external_id) DO UPDATE SET local_id=excluded.local_id,synced_at=excluded.synced_at,metadata_json=excluded.metadata_json`)
    .run(makeId('ext'), 'pandascore', entityType, externalId, localId, syncedAt, JSON.stringify(metadata))
}

function uniqueTeamName(name: string, externalId: string) {
  const row = useDatabase().prepare('SELECT id FROM teams WHERE lower(name) = lower(?)').get(name)
  return row ? `${name} · PS ${externalId.slice(-5)}` : name
}

interface DownloadedLogo { bytes: Uint8Array, mimeType: string, name: string }

function upsertTeam(team: NonNullable<ExternalMatch['teamA']>, logo: DownloadedLogo | null, syncedAt: string, preferredLocalId?: string, region = '') {
  const linked = externalRow('team', team.externalId)
  const previousMetadata = externalMetadata(linked)
  const existingId = linked?.local_id || preferredLocalId
  const existing = existingId ? useDatabase().prepare('SELECT * FROM teams WHERE id = ?').get(String(existingId)) as Row | undefined : undefined
  const key = String(existing?.id || makeId('team'))
  const timestamp = now()
  let logoAssetId = existing?.logo_asset_id ? String(existing.logo_asset_id) : null
  if (logo) {
    logoAssetId = makeId('asset')
    useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)')
      .run(logoAssetId, 'team-logo', logo.mimeType, logo.bytes, logo.name, timestamp)
  }
  const name = existing ? team.name : uniqueTeamName(team.name, team.externalId)
  useDatabase().prepare(`INSERT INTO teams(id,name,short_name,region,notes,logo_asset_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,short_name=excluded.short_name,region=excluded.region,logo_asset_id=excluded.logo_asset_id,updated_at=excluded.updated_at`)
    .run(key, name, team.shortName || '', String(existing?.region || region || ''), String(existing?.notes || ''), logoAssetId, String(existing?.created_at || timestamp), timestamp)
  upsertExternal('team', team.externalId, key, syncedAt, { logoUrl: logo ? team.logoUrl : previousMetadata.logoUrl ?? null, logoAssetId })
  return key
}

/** Local team linked to a PandaScore id, or an unlinked local team with the same name. */
export function findLocalTeamForPandaScore(externalId: string, name: string): string | null {
  const linked = externalRow('team', externalId)
  if (linked?.local_id) return String(linked.local_id)
  const sameName = useDatabase().prepare(`SELECT id FROM teams WHERE lower(name) = lower(?) AND id NOT IN
    (SELECT local_id FROM external_entities WHERE provider = 'pandascore' AND entity_type = 'team')`).get(name) as Row | undefined
  return sameName ? String(sameName.id) : null
}

async function logoForTeam(team: { externalId: string, logoUrl: string | null }, fetchImpl?: FetchLike) {
  if (!team.logoUrl) return null
  if (externalMetadata(externalRow('team', team.externalId)).logoUrl === team.logoUrl) return null
  try { return await downloadPandaScoreLogo(team.logoUrl, fetchImpl) } catch { return null }
}

/** Create or update local teams from PandaScore records, including logos and region. */
export async function importPandaScoreTeams(teams: ExternalTeamDetails[], options: { fetchImpl?: FetchLike } = {}) {
  const logos = await Promise.all(teams.map(team => logoForTeam(team, options.fetchImpl)))
  const database = useDatabase()
  const syncedAt = now()
  const result: Array<{ externalId: string, localId: string, created: boolean }> = []
  database.exec('BEGIN IMMEDIATE')
  try {
    teams.forEach((team, index) => {
      const existingId = findLocalTeamForPandaScore(team.externalId, team.name)
      const localId = upsertTeam(team, logos[index] ?? null, syncedAt, existingId ?? undefined, team.location ?? '')
      result.push({ externalId: team.externalId, localId, created: !existingId })
    })
    database.exec('COMMIT')
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
  return { imported: result, created: result.filter(item => item.created).length, updated: result.filter(item => !item.created).length }
}

/** Local tournament linked to a PandaScore series, or an unlinked local tournament with the same name. */
export function findLocalTournamentForPandaScore(externalId: string, name: string): string | null {
  const linked = externalRow('tournament', externalId)
  if (linked?.local_id) return String(linked.local_id)
  const sameName = useDatabase().prepare(`SELECT id FROM tournaments WHERE lower(name) = lower(?) AND id NOT IN
    (SELECT local_id FROM external_entities WHERE provider = 'pandascore' AND entity_type = 'tournament')`).get(name) as Row | undefined
  return sameName ? String(sameName.id) : null
}

function uniqueTournamentName(name: string, externalId: string) {
  const row = useDatabase().prepare('SELECT id FROM tournaments WHERE lower(name) = lower(?)').get(name)
  return row ? `${name} · PS ${externalId.slice(-5)}` : name
}

function upsertTournament(tournament: ExternalTournament, logo: DownloadedLogo | null, syncedAt: string, existingId: string | null) {
  const previousMetadata = externalMetadata(externalRow('tournament', tournament.externalId))
  const existing = existingId ? useDatabase().prepare('SELECT * FROM tournaments WHERE id = ?').get(existingId) as Row | undefined : undefined
  const key = String(existing?.id || makeId('tournament'))
  const timestamp = now()
  let logoAssetId = existing?.logo_asset_id ? String(existing.logo_asset_id) : null
  if (logo) {
    logoAssetId = makeId('asset')
    useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)')
      .run(logoAssetId, 'tournament-logo', logo.mimeType, logo.bytes, logo.name, timestamp)
  }
  const name = existing ? tournament.name : uniqueTournamentName(tournament.name, tournament.externalId)
  useDatabase().prepare(`INSERT INTO tournaments(id,name,league,tier,start_date,end_date,notes,logo_asset_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,league=excluded.league,tier=excluded.tier,start_date=excluded.start_date,end_date=excluded.end_date,logo_asset_id=excluded.logo_asset_id,updated_at=excluded.updated_at`)
    .run(key, name, tournament.league, tournament.tier, tournament.startDate, tournament.endDate, String(existing?.notes || ''), logoAssetId, String(existing?.created_at || timestamp), timestamp)
  upsertExternal('tournament', tournament.externalId, key, syncedAt, { kind: 'serie', logoUrl: logo ? tournament.logoUrl : previousMetadata.logoUrl ?? null, logoAssetId })
  return key
}

async function logoForTournament(tournament: ExternalTournament, fetchImpl?: FetchLike) {
  if (!tournament.logoUrl) return null
  if (externalMetadata(externalRow('tournament', tournament.externalId)).logoUrl === tournament.logoUrl) return null
  try { return await downloadPandaScoreLogo(tournament.logoUrl, fetchImpl) } catch { return null }
}

/** Create or update local tournaments from PandaScore series, including league logos. */
export async function importPandaScoreTournaments(tournaments: ExternalTournament[], options: { fetchImpl?: FetchLike } = {}) {
  const logos = await Promise.all(tournaments.map(tournament => logoForTournament(tournament, options.fetchImpl)))
  const database = useDatabase()
  const syncedAt = now()
  const result: Array<{ externalId: string, localId: string, created: boolean }> = []
  database.exec('BEGIN IMMEDIATE')
  try {
    tournaments.forEach((tournament, index) => {
      const existingId = findLocalTournamentForPandaScore(tournament.externalId, tournament.name)
      const localId = upsertTournament(tournament, logos[index] ?? null, syncedAt, existingId)
      result.push({ externalId: tournament.externalId, localId, created: !existingId })
    })
    database.exec('COMMIT')
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
  return { imported: result, created: result.filter(item => item.created).length, updated: result.filter(item => !item.created).length }
}

function scheduleParts(match: ExternalMatch) {
  const value = match.scheduledAt || match.beginAt || now()
  return { startDate: value.slice(0, 10), startTime: value.slice(11, 16) || '00:00' }
}

function localWinner(match: ExternalMatch, teamAId: string, teamBId: string) {
  if (match.status !== 'completed') return null
  if (match.winnerExternalTeamId === match.teamA?.externalId) return teamAId
  if (match.winnerExternalTeamId === match.teamB?.externalId) return teamBId
  return null
}

function upsertMatch(match: ExternalMatch, teamAId: string, teamBId: string, syncedAt: string) {
  const linked = externalRow('match', match.externalId)
  const existing = linked ? useDatabase().prepare('SELECT * FROM matches WHERE id = ?').get(String(linked.local_id)) as Row | undefined : undefined
  const key = String(existing?.id || makeId('match'))
  const timestamp = now()
  const schedule = scheduleParts(match)
  const winnerTeamId = localWinner(match, teamAId, teamBId)
  const clearScore = match.status === 'scheduled' || match.status === 'cancelled'
  useDatabase().prepare(`INSERT INTO matches(id,team_a_id,team_b_id,tournament,stage,start_date,start_time,timezone,format,status,score_a,score_b,notes,created_at,updated_at,winner_team_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET team_a_id=excluded.team_a_id,team_b_id=excluded.team_b_id,tournament=excluded.tournament,stage=excluded.stage,start_date=excluded.start_date,start_time=excluded.start_time,timezone=excluded.timezone,format=excluded.format,status=excluded.status,score_a=excluded.score_a,score_b=excluded.score_b,updated_at=excluded.updated_at,winner_team_id=excluded.winner_team_id`)
    .run(key, teamAId, teamBId, match.tournament.leagueName || match.tournament.name, match.tournament.name, schedule.startDate, schedule.startTime, 'UTC', match.format, match.status, clearScore ? null : match.scoreA, clearScore ? null : match.scoreB, String(existing?.notes || ''), String(existing?.created_at || timestamp), timestamp, winnerTeamId)
  upsertExternal('match', match.externalId, key, syncedAt, { tournament: match.tournament, name: match.name })
  return key
}

function upsertAutomaticDraft(matchId: string, game: ExternalMatch['games'][number], enrichment: OpenDotaEnrichment, teamAId: string, teamBId: string, match: ExternalMatch) {
  const existing = useDatabase().prepare('SELECT id FROM drafts WHERE match_id = ? AND map_number = ?').get(matchId, game.mapNumber) as Row | undefined
  if (existing) return
  const localTeam = (externalId: string) => externalId === match.teamA?.externalId ? teamAId : externalId === match.teamB?.externalId ? teamBId : null
  const radiantTeamId = localTeam(enrichment.radiantExternalTeamId)
  const direTeamId = localTeam(enrichment.direExternalTeamId)
  if (!radiantTeamId || !direTeamId || radiantTeamId === direTeamId) return
  const timestamp = now()
  const draft = {
    id: null, matchId, mapNumber: game.mapNumber, radiantTeamId, direTeamId,
    picksRadiant: enrichment.picksRadiant, picksDire: enrichment.picksDire,
    bansRadiant: enrichment.bansRadiant, bansDire: enrichment.bansDire, winner: enrichment.winner,
    source: { provider: 'opendota', externalId: enrichment.externalId, syncedAt: timestamp }
  }
  useDatabase().prepare('INSERT INTO drafts(id,match_id,map_number,data_json,updated_at) VALUES(?,?,?,?,?)')
    .run(makeId('draft'), matchId, game.mapNumber, JSON.stringify(draft), timestamp)
}

function upsertGames(matchId: string, match: ExternalMatch, teamAId: string, teamBId: string, syncedAt: string, enrichmentByGame: Map<string, OpenDotaEnrichment>) {
  for (const game of match.games) {
    const existing = useDatabase().prepare('SELECT * FROM match_games WHERE (provider = ? AND external_id = ?) OR (match_id = ? AND map_number = ?) LIMIT 1')
      .get('pandascore', game.externalId, matchId, game.mapNumber) as Row | undefined
    const key = String(existing?.id || makeId('game'))
    const winnerTeamId = game.status === 'completed'
      ? game.winnerExternalTeamId === match.teamA?.externalId ? teamAId : game.winnerExternalTeamId === match.teamB?.externalId ? teamBId : null
      : null
    const timestamp = now()
    const enrichment = enrichmentByGame.get(game.externalId)
    useDatabase().prepare(`INSERT INTO match_games(id,match_id,provider,external_id,map_number,status,winner_team_id,begin_at,end_at,created_at,updated_at,stats_provider,stats_external_id,stats_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET external_id=excluded.external_id,map_number=excluded.map_number,status=excluded.status,winner_team_id=excluded.winner_team_id,begin_at=excluded.begin_at,end_at=excluded.end_at,updated_at=excluded.updated_at,stats_provider=COALESCE(excluded.stats_provider,match_games.stats_provider),stats_external_id=COALESCE(excluded.stats_external_id,match_games.stats_external_id),stats_json=COALESCE(excluded.stats_json,match_games.stats_json)`)
      .run(key, matchId, 'pandascore', game.externalId, game.mapNumber, game.status, winnerTeamId, game.beginAt, game.endAt, String(existing?.created_at || timestamp), timestamp, enrichment ? 'opendota' : null, enrichment?.externalId ?? null, enrichment ? JSON.stringify(enrichment.stats) : null)
    upsertExternal('game', game.externalId, key, syncedAt, { matchId, mapNumber: game.mapNumber })
    if (enrichment) upsertAutomaticDraft(matchId, game, enrichment, teamAId, teamBId, match)
  }
}

export async function importPandaScoreMatch(match: ExternalMatch, options: {
  fetchImpl?: FetchLike, teamMappings?: Array<{ externalId: string, localId: string }>,
  enrichOpenDota?: boolean, openDotaApiKey?: string, openDotaFetchImpl?: FetchLike, openDotaBaseUrl?: string
} = {}) {
  if (!match.teamA || !match.teamB) throw createError({ statusCode: 422, statusMessage: 'Нельзя импортировать матч без двух известных команд' })
  const logos = await Promise.all([match.teamA, match.teamB].map(team => logoForTeam(team, options.fetchImpl)))
  const database = useDatabase()
  const syncedAt = now()
  const enrichmentByGame = new Map<string, OpenDotaEnrichment>()
  if (options.enrichOpenDota !== false) {
    await Promise.all(match.games.filter(game => game.status === 'completed').map(async game => {
      const saved = database.prepare('SELECT stats_external_id FROM match_games WHERE provider = ? AND external_id = ?').get('pandascore', game.externalId) as Row | undefined
      if (saved?.stats_external_id) return
      try {
        const enrichment = await findOpenDotaGame(match, game, { apiKey: options.openDotaApiKey, fetchImpl: options.openDotaFetchImpl, baseUrl: options.openDotaBaseUrl })
        if (enrichment) enrichmentByGame.set(game.externalId, enrichment)
      } catch { /* OpenDota enrichment is best-effort; manual draft remains available. */ }
    }))
  }
  const mappings = new Map((options.teamMappings || []).map(mapping => [mapping.externalId, mapping.localId]))
  database.exec('BEGIN IMMEDIATE')
  let matchId: string
  try {
    const teamAId = upsertTeam(match.teamA, logos[0] ?? null, syncedAt, mappings.get(match.teamA.externalId))
    const teamBId = upsertTeam(match.teamB, logos[1] ?? null, syncedAt, mappings.get(match.teamB.externalId))
    matchId = upsertMatch(match, teamAId, teamBId, syncedAt)
    upsertGames(matchId, match, teamAId, teamBId, syncedAt, enrichmentByGame)
    database.exec('COMMIT')
  } catch (cause) {
    database.exec('ROLLBACK')
    throw cause
  }
  return { matchId, package: getPublicationPackage(matchId) }
}

function game(row: Row) {
  let stats: Record<string, unknown> | null = null
  try { stats = row.stats_json ? json<Record<string, unknown>>(String(row.stats_json)) : null } catch { stats = null }
  return matchGameSchema.parse({ id: row.id, matchId: row.match_id, provider: row.provider, externalId: row.external_id, mapNumber: row.map_number, status: row.status, winnerTeamId: row.winner_team_id, beginAt: row.begin_at, endAt: row.end_at, statsProvider: row.stats_provider ?? null, statsExternalId: row.stats_external_id ?? null, stats, createdAt: row.created_at, updatedAt: row.updated_at })
}

function itemWithProject(item: Omit<z.infer<typeof packageItemSchema>, 'projectId'>) {
  const project = repository.projects.findByDedupe(item.key)
  return packageItemSchema.parse({ ...item, status: project ? 'created' : item.status, projectId: project?.id ?? null })
}

export function getPublicationPackage(matchId: string, trackedTeamId?: string | null): PublicationPackage {
  const match = repository.matches.get(matchId) as Record<string, unknown> | null
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Матч не найден' })
  const sourceRow = useDatabase().prepare('SELECT * FROM external_entities WHERE provider = ? AND entity_type = ? AND local_id = ?').get('pandascore', 'match', matchId) as Row | undefined
  if (!sourceRow) throw createError({ statusCode: 422, statusMessage: 'Матч не связан с PandaScore' })
  const teams = [repository.teams.get(String(match.teamAId)), repository.teams.get(String(match.teamBId))].filter(Boolean) as Array<Record<string, unknown>>
  const games = (useDatabase().prepare('SELECT * FROM match_games WHERE match_id = ? ORDER BY map_number').all(matchId) as Row[]).map(game)
  const selectedTeam = trackedTeamId || repository.settings.get('pandascore.trackedTeamId', null) as string | null
  const validTrackedTeam = teams.some(team => team.id === selectedTeam) ? selectedTeam : null
  const prefix = `pandascore:${String(sourceRow.external_id)}`
  const items: z.infer<typeof packageItemSchema>[] = []
  items.push(itemWithProject({ key: `announcement:${prefix}`, kind: 'announcement', title: 'Анонс матча', templateId: 'match-announcement', mapNumber: null, gameId: null, externalGameId: null, status: 'ready', reason: null }))
  for (const current of games) {
    const draft = repository.drafts.find(matchId, current.mapNumber) as Record<string, unknown> | null
    const completeDraft = !!draft && Array.isArray(draft.picksRadiant) && Array.isArray(draft.picksDire) && draft.picksRadiant.filter(Boolean).length === 5 && draft.picksDire.filter(Boolean).length === 5
    items.push(itemWithProject({ key: `draft:${prefix}:${current.mapNumber}`, kind: 'draft', title: `Драфт карты №${current.mapNumber}`, templateId: 'draft', mapNumber: current.mapNumber, gameId: current.id, externalGameId: current.externalId, status: completeDraft ? 'ready' : 'requires_input', reason: completeDraft ? null : current.status === 'completed' ? 'OpenDota не удалось надёжно сопоставить карту — заполните драфт вручную.' : 'Пики и баны появятся после завершения карты; драфт также можно заполнить вручную.' }))
    const mapKey = validTrackedTeam ? `map-result:pandascore:${current.externalId}:${validTrackedTeam}` : `map-result:pandascore:${current.externalId}:team-required`
    items.push(itemWithProject({ key: mapKey, kind: 'map-result', title: `Результат карты №${current.mapNumber}`, templateId: 'series-result', mapNumber: current.mapNumber, gameId: current.id, externalGameId: current.externalId,
      status: current.status !== 'completed' ? 'waiting_for_game' : !current.winnerTeamId ? 'unavailable' : !validTrackedTeam ? 'requires_input' : 'ready',
      reason: current.status !== 'completed' ? 'Ожидает завершения карты.' : !current.winnerTeamId ? 'PandaScore не передал победителя карты.' : !validTrackedTeam ? 'Выберите нашу команду.' : null }))
  }
  const seriesSuffix = validTrackedTeam || 'team-required'
  const seriesReady = match.status === 'completed' && !!match.winnerTeamId && !!validTrackedTeam
  items.push(itemWithProject({ key: `series-result:${prefix}:${seriesSuffix}`, kind: 'series-result', title: 'Результат серии', templateId: 'series-result', mapNumber: null, gameId: null, externalGameId: null,
    status: match.status !== 'completed' ? 'waiting_for_series' : !match.winnerTeamId ? 'unavailable' : !validTrackedTeam ? 'requires_input' : 'ready',
    reason: match.status !== 'completed' ? 'Финальный результат станет доступен после завершения серии.' : !match.winnerTeamId ? 'У серии нет победителя.' : !validTrackedTeam ? 'Выберите нашу команду.' : null }))
  items.push(itemWithProject({ key: `team-outcome:${prefix}:${seriesSuffix}`, kind: 'team-outcome', title: 'Победа или поражение', templateId: seriesReady && match.winnerTeamId === validTrackedTeam ? 'win' : 'lose', mapNumber: null, gameId: null, externalGameId: null,
    status: match.status !== 'completed' ? 'waiting_for_series' : !match.winnerTeamId ? 'unavailable' : !validTrackedTeam ? 'requires_input' : 'ready',
    reason: match.status !== 'completed' ? 'Публикация доступна после завершения серии.' : !match.winnerTeamId ? 'У серии нет победителя.' : !validTrackedTeam ? 'Выберите нашу команду.' : null }))
  return publicationPackageSchema.parse({ match, teams, games, trackedTeamId: validTrackedTeam, source: { provider: 'pandascore', externalId: String(sourceRow.external_id), syncedAt: String(sourceRow.synced_at) }, items })
}

const templates = { 'match-announcement': announcementTemplate, draft: draftTemplate, 'series-result': seriesTemplate, win: winTemplate, lose: loseTemplate } as const

function snapshotForItem(pkg: PublicationPackage, packageItem: z.infer<typeof packageItemSchema>) {
  const match = pkg.match as any
  const teamsById = Object.fromEntries((pkg.teams as any[]).map(team => [team.id, team]))
  const template = templates[packageItem.templateId as keyof typeof templates]
  if (!template) throw createError({ statusCode: 422, statusMessage: 'Шаблон пакета не найден' })
  const texts = defaultTexts(template)
  if (packageItem.kind === 'draft') {
    const draft = repository.drafts.find(String(match.id), packageItem.mapNumber!) as any
    return { template, data: buildDraftData(match, draft, teamsById, HEROES_BY_ID, {}, { texts }) }
  }
  let snapshotMatch = match
  if (packageItem.kind === 'map-result') {
    const current = pkg.games.find(game => game.id === packageItem.gameId)!
    snapshotMatch = { ...match, format: 'BO1', status: 'completed', scoreA: current.winnerTeamId === match.teamAId ? 1 : 0, scoreB: current.winnerTeamId === match.teamBId ? 1 : 0, winnerTeamId: current.winnerTeamId }
  }
  const perspective = pkg.trackedTeamId === match.teamBId ? 'B' : 'A'
  return { template, data: buildMatchData(snapshotMatch, teamsById, { texts, perspective }) }
}

export function createPackageProjects(matchId: string, options: { trackedTeamId?: string | null, keys?: string[], forceNewVersion?: boolean } = {}) {
  if (options.trackedTeamId) repository.settings.set('pandascore.trackedTeamId', options.trackedTeamId)
  let pkg = getPublicationPackage(matchId, options.trackedTeamId)
  const wanted = new Set(options.keys || pkg.items.filter(item => item.status === 'ready').map(item => item.key))
  const created = []
  for (const packageItem of pkg.items) {
    if (!wanted.has(packageItem.key) || !['ready', 'created'].includes(packageItem.status)) continue
    if (packageItem.projectId && !options.forceNewVersion) continue
    const { template, data } = snapshotForItem(pkg, packageItem)
    const createdAt = now()
    const source = { provider: 'pandascore', seriesExternalId: pkg.source.externalId, gameExternalId: packageItem.externalGameId, eventType: packageItem.kind, createdAt, displayedData: data }
    const project = repository.projects.save({
      id: null, title: packageItem.title, templateId: template.id, templateVersion: template.version,
      matchId, data, style: defaultStyle(template), size: template.exportSizes[0].id,
      thumbnailAssetId: null, createdAt: null, dedupeKey: packageItem.key, source
    }, 'Создано из пакета PandaScore')
    created.push(project)
  }
  pkg = getPublicationPackage(matchId, options.trackedTeamId)
  return { package: pkg, created }
}
