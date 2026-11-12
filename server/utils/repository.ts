import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { json, useDatabase } from './database'
import { detectTransparency, isImageType } from './media'
import { getHero } from '../../src/data/heroes'

type Row = Record<string, unknown>
const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${randomUUID()}`
const REVISIONS_PER_PROJECT = 30

/* ---------- Input schemas ---------- */

const teamSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(60),
  shortName: z.string().trim().max(12).default(''),
  region: z.string().trim().max(40).default(''),
  notes: z.string().trim().max(500).default(''),
  logoAssetId: z.string().nullable().default(null)
})

const optionalDate = z.preprocess(value => value === '' ? null : value, z.iso.date().nullable().default(null))
const tournamentSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().trim().min(1, 'Введите название турнира').max(120),
  league: z.string().trim().max(80).default(''),
  leagueId: z.string().nullable().optional(),
  tier: z.enum(['', 'S', 'A', 'B', 'C', 'D']).default(''),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: z.string().trim().max(500).default(''),
  logoAssetId: z.string().nullable().default(null)
}).refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: 'Дата окончания раньше даты начала', path: ['endDate'] })

const leagueSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().trim().min(1, 'Введите название лиги').max(80),
  notes: z.string().trim().max(500).default(''),
  logoAssetId: z.string().nullable().default(null)
})

/** A PandaScore "tournament": one stage (group stage, playoffs…) of a series. */
const stageSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().trim().min(1, 'Введите название турнира').max(120),
  seriesId: z.preprocess(value => value === '' ? null : value, z.string().nullable().default(null)),
  tier: z.enum(['', 'S', 'A', 'B', 'C', 'D']).default(''),
  startDate: optionalDate,
  endDate: optionalDate,
  prizePool: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(500).default('')
}).refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: 'Дата окончания раньше даты начала', path: ['endDate'] })

const playerSchema = z.object({
  id: z.string().nullable().optional(),
  nickname: z.string().trim().min(1, 'Введите ник игрока').max(40),
  realName: z.string().trim().max(80).default(''),
  teamId: z.preprocess(value => value === '' ? null : value, z.string().nullable().default(null)),
  role: z.enum(['', '1', '2', '3', '4', '5']).default(''),
  country: z.string().trim().max(40).default(''),
  notes: z.string().trim().max(500).default(''),
  photoAssetId: z.string().nullable().default(null)
})

const heroImageSchema = z.object({
  id: z.string().nullable().optional(),
  heroId: z.number().int().refine(value => !!getHero(value), 'Герой не найден в каталоге'),
  title: z.string().trim().max(80).default(''),
  assetId: z.string().min(1, 'Загрузите изображение'),
  /** Measured by the browser from real pixels; the file header can only say that an alpha channel exists. */
  hasAlpha: z.boolean().nullable().optional()
})

const matchSchema = z.object({
  id: z.string().nullable().optional(),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  tournament: z.string().trim().min(1).max(100),
  stage: z.string().trim().max(80).default(''),
  startDate: z.iso.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  format: z.enum(['BO1', 'BO2', 'BO3', 'BO5']),
  status: z.enum(['scheduled', 'live', 'completed', 'cancelled']),
  scoreA: z.number().int().min(0).max(9).nullable().default(null),
  scoreB: z.number().int().min(0).max(9).nullable().default(null),
  winnerTeamId: z.string().nullable().default(null),
  notes: z.string().max(1000).default('')
}).refine(value => value.teamAId !== value.teamBId, { message: 'Выберите разные команды', path: ['teamBId'] })

const projectSchema = z.object({
  id: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  matchId: z.string().nullable().default(null),
  data: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()),
  size: z.string().min(1),
  thumbnailAssetId: z.string().nullable().default(null),
  createdAt: z.string().nullable().optional(),
  dedupeKey: z.string().max(300).nullable().default(null),
  source: z.record(z.string(), z.unknown()).nullable().default(null)
})

const draftSchema = z.object({
  id: z.string().nullable().optional(),
  matchId: z.string().min(1),
  mapNumber: z.number().int().min(1).max(20)
}).passthrough()

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw createError({ statusCode: 422, statusMessage: result.error.issues[0]?.message || 'Некорректные данные', data: result.error.flatten() })
  }
  return result.data
}

/* ---------- SQL helpers ---------- */

const TEAM_COLUMNS = ['id', 'name', 'short_name', 'region', 'notes', 'logo_asset_id', 'created_at', 'updated_at']
const TOURNAMENT_COLUMNS = ['id', 'name', 'league', 'tier', 'start_date', 'end_date', 'notes', 'logo_asset_id', 'created_at', 'updated_at', 'league_id']
const LEAGUE_COLUMNS = ['id', 'name', 'notes', 'logo_asset_id', 'created_at', 'updated_at']
const STAGE_COLUMNS = ['id', 'name', 'series_id', 'tier', 'start_date', 'end_date', 'prize_pool', 'notes', 'created_at', 'updated_at']
const PLAYER_COLUMNS = ['id', 'nickname', 'real_name', 'team_id', 'role', 'country', 'notes', 'photo_asset_id', 'created_at', 'updated_at']
const HERO_IMAGE_COLUMNS = ['id', 'hero_id', 'title', 'image_asset_id', 'has_alpha', 'created_at', 'updated_at']
const MATCH_COLUMNS = [
  'id', 'team_a_id', 'team_b_id', 'tournament', 'stage', 'start_date', 'start_time', 'timezone',
  'format', 'status', 'score_a', 'score_b', 'winner_team_id', 'notes', 'created_at', 'updated_at'
]
const PROJECT_COLUMNS = [
  'id', 'title', 'template_id', 'template_version', 'match_id', 'data_json', 'style_json', 'size',
  'thumbnail_asset_id', 'dedupe_key', 'source_json', 'created_at', 'updated_at', 'saved_at'
]
const DRAFT_COLUMNS = ['id', 'match_id', 'map_number', 'data_json', 'updated_at']

/** INSERT ... ON CONFLICT DO UPDATE; every column except the conflict target and `keep` is refreshed. */
function upsertSql(table: string, columns: string[], conflict: string[], keep: string[] = []) {
  const skipped = new Set([...conflict, ...keep])
  const updates = columns.filter(column => !skipped.has(column)).map(column => `${column} = excluded.${column}`).join(', ')
  return `INSERT INTO ${table} (${columns.join(', ')})
VALUES (${columns.map(() => '?').join(', ')})
ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${updates}`
}

const SQL = {
  team: upsertSql('teams', TEAM_COLUMNS, ['id'], ['created_at']),
  tournament: upsertSql('tournaments', TOURNAMENT_COLUMNS, ['id'], ['created_at']),
  league: upsertSql('leagues', LEAGUE_COLUMNS, ['id'], ['created_at']),
  stage: upsertSql('stages', STAGE_COLUMNS, ['id'], ['created_at']),
  player: upsertSql('players', PLAYER_COLUMNS, ['id'], ['created_at']),
  heroImage: upsertSql('hero_images', HERO_IMAGE_COLUMNS, ['id'], ['created_at']),
  match: upsertSql('matches', MATCH_COLUMNS, ['id'], ['created_at']),
  project: upsertSql('projects', PROJECT_COLUMNS, ['id'], ['created_at']),
  draft: upsertSql('drafts', DRAFT_COLUMNS, ['match_id', 'map_number'], ['id']),
  setting: 'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json',
  insertRevision: 'INSERT INTO revisions (id, project_id, saved_at, note, snapshot_json) VALUES (?, ?, ?, ?, ?)',
  trimRevisions: `DELETE FROM revisions
WHERE project_id = ?
  AND id NOT IN (SELECT id FROM revisions WHERE project_id = ? ORDER BY saved_at DESC LIMIT ${REVISIONS_PER_PROJECT})`
}

const one = (sql: string, ...params: Array<string | number>) => useDatabase().prepare(sql).get(...params) as Row | undefined
const all = (sql: string, ...params: Array<string | number>) => useDatabase().prepare(sql).all(...params) as Row[]
const createdAtOf = (table: string, key: string | null | undefined) => key ? one(`SELECT created_at FROM ${table} WHERE id = ?`, key)?.created_at as string | undefined : undefined

/** League with this name (case-insensitive), created when missing. A logo is only adopted when the league has none. */
function ensureLeagueByName(name: string, logoAssetId: string | null, timestamp: string): string {
  const existing = one('SELECT id, logo_asset_id FROM leagues WHERE lower(name) = lower(?)', name)
  if (existing) {
    if (!existing.logo_asset_id && logoAssetId) useDatabase().prepare('UPDATE leagues SET logo_asset_id = ?, updated_at = ? WHERE id = ?').run(logoAssetId, timestamp, String(existing.id))
    return String(existing.id)
  }
  const key = id('league')
  useDatabase().prepare(SQL.league).run(key, name, '', logoAssetId, timestamp, timestamp)
  return key
}

/* ---------- Row mappers ---------- */

type ExternalRef = { provider: unknown, externalId: unknown }

/** External refs of one entity type for all rows (no id) or one row, grouped by local id in a single query. */
function externalRefs(entityType: 'team' | 'tournament' | 'player', localId?: string): Map<string, ExternalRef[]> {
  const filter = localId ? ' AND local_id = ?' : ''
  const rows = all(`SELECT local_id, provider, external_id FROM external_entities WHERE entity_type = ?${filter} ORDER BY provider`, entityType, ...(localId ? [localId] : []))
  const byLocalId = new Map<string, ExternalRef[]>()
  for (const row of rows) {
    const key = String(row.local_id)
    byLocalId.set(key, [...(byLocalId.get(key) ?? []), { provider: row.provider, externalId: row.external_id }])
  }
  return byLocalId
}

function toTeam(row: Row, refs: Map<string, ExternalRef[]>) {
  return {
    id: row.id, name: row.name, shortName: row.short_name, region: row.region, notes: row.notes,
    logoAssetId: row.logo_asset_id, createdAt: row.created_at, updatedAt: row.updated_at,
    externalRefs: refs.get(String(row.id)) ?? []
  }
}

const ownExternalRef = (row: Row): ExternalRef[] => row.external_id ? [{ provider: 'pandascore', externalId: row.external_id }] : []

function toLeague(row: Row) {
  return {
    id: row.id, name: row.name, notes: row.notes, logoAssetId: row.logo_asset_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at, externalRefs: ownExternalRef(row)
  }
}

function toStage(row: Row) {
  return {
    id: row.id, name: row.name, seriesId: row.series_id ?? null, tier: row.tier, startDate: row.start_date ?? null, endDate: row.end_date ?? null,
    prizePool: row.prize_pool, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, externalRefs: ownExternalRef(row)
  }
}

function toTournament(row: Row, refs: Map<string, ExternalRef[]>) {
  return {
    id: row.id, name: row.name, league: row.league, leagueId: row.league_id ?? null, tier: row.tier, startDate: row.start_date ?? null, endDate: row.end_date ?? null,
    notes: row.notes, logoAssetId: row.logo_asset_id, createdAt: row.created_at, updatedAt: row.updated_at,
    externalRefs: refs.get(String(row.id)) ?? []
  }
}

function toPlayer(row: Row, refs: Map<string, ExternalRef[]>) {
  return {
    id: row.id, nickname: row.nickname, realName: row.real_name, teamId: row.team_id ?? null, role: row.role, country: row.country,
    notes: row.notes, photoAssetId: row.photo_asset_id, createdAt: row.created_at, updatedAt: row.updated_at,
    externalRefs: refs.get(String(row.id)) ?? []
  }
}

/** A hero picture with its stored image type (joined from media); the bytes are never loaded for lists. */
const HERO_IMAGE_SELECT = `SELECT h.*, m.mime_type FROM hero_images h JOIN media m ON m.id = h.image_asset_id`

function toHeroImage(row: Row) {
  return {
    id: row.id, heroId: row.hero_id, title: row.title, assetId: row.image_asset_id, mimeType: row.mime_type,
    hasAlpha: row.has_alpha === null || row.has_alpha === undefined ? null : Number(row.has_alpha) === 1,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

function toMatch(row: Row) {
  return {
    id: row.id, teamAId: row.team_a_id, teamBId: row.team_b_id, tournament: row.tournament, stage: row.stage,
    startDate: row.start_date, startTime: row.start_time, timezone: row.timezone, format: row.format, status: row.status,
    scoreA: row.score_a, scoreB: row.score_b, winnerTeamId: row.winner_team_id, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at,
    source: row.ps_external_id ? { provider: 'pandascore', externalId: row.ps_external_id, syncedAt: row.ps_synced_at } : null
  }
}

/** Matches with their PandaScore link (if any), so the UI knows which ones have a publication package. */
const MATCH_SELECT = `SELECT m.*, e.external_id AS ps_external_id, e.synced_at AS ps_synced_at FROM matches m
LEFT JOIN external_entities e ON e.provider = 'pandascore' AND e.entity_type = 'match' AND e.local_id = m.id`

function toProject(row: Row) {
  return {
    id: row.id, title: row.title, templateId: row.template_id, templateVersion: row.template_version, matchId: row.match_id,
    data: json(String(row.data_json)), style: json(String(row.style_json)), size: row.size,
    thumbnailAssetId: row.thumbnail_asset_id, createdAt: row.created_at, updatedAt: row.updated_at, savedAt: row.saved_at,
    dedupeKey: row.dedupe_key ?? null, source: row.source_json ? json(String(row.source_json)) : null
  }
}

function toDraft(row: Row) {
  return { ...json<Record<string, unknown>>(String(row.data_json)), id: row.id, matchId: row.match_id, mapNumber: row.map_number, updatedAt: row.updated_at }
}

/* ---------- Repository ---------- */

export const repository = {
  teams: {
    list() {
      const refs = externalRefs('team')
      return all('SELECT * FROM teams ORDER BY name COLLATE NOCASE').map(row => toTeam(row, refs))
    },
    get(key: string) {
      const row = one('SELECT * FROM teams WHERE id = ?', key)
      return row ? toTeam(row, externalRefs('team', key)) : null
    },
    save(input: unknown) {
      const value = parse(teamSchema, input)
      const key = value.id || id('team')
      const timestamp = now()
      const createdAt = createdAtOf('teams', value.id) || timestamp
      try {
        useDatabase().prepare(SQL.team).run(key, value.name, value.shortName, value.region, value.notes, value.logoAssetId, createdAt, timestamp)
      } catch (cause) {
        if (String(cause).includes('teams_name_unique')) throw createError({ statusCode: 409, statusMessage: 'Команда с таким названием уже существует' })
        throw cause
      }
      return this.get(key)
    },
    remove(key: string) {
      const usage = Number(one('SELECT count(*) AS count FROM matches WHERE team_a_id = ? OR team_b_id = ?', key, key)!.count)
      if (usage) throw createError({ statusCode: 409, statusMessage: `Команда используется в ${usage} матч(ах)` })
      useDatabase().prepare('DELETE FROM teams WHERE id = ?').run(key)
    }
  },

  tournaments: {
    list() {
      const refs = externalRefs('tournament')
      return all('SELECT * FROM tournaments ORDER BY start_date IS NULL, start_date DESC, name COLLATE NOCASE').map(row => toTournament(row, refs))
    },
    get(key: string) {
      const row = one('SELECT * FROM tournaments WHERE id = ?', key)
      return row ? toTournament(row, externalRefs('tournament', key)) : null
    },
    save(input: unknown) {
      const value = parse(tournamentSchema, input)
      const key = value.id || id('tournament')
      const timestamp = now()
      const createdAt = createdAtOf('tournaments', value.id) || timestamp
      // A series belongs to a league: an explicit leagueId wins, otherwise the league name is matched (or created).
      const explicit = value.leagueId ? one('SELECT id, name FROM leagues WHERE id = ?', value.leagueId) : undefined
      if (value.leagueId && !explicit) throw createError({ statusCode: 422, statusMessage: 'Лига не найдена' })
      const leagueName = explicit ? String(explicit.name) : value.league
      const leagueId = explicit ? String(explicit.id) : leagueName ? ensureLeagueByName(leagueName, value.logoAssetId, timestamp) : null
      try {
        useDatabase().prepare(SQL.tournament).run(key, value.name, leagueName, value.tier, value.startDate, value.endDate, value.notes, value.logoAssetId, createdAt, timestamp, leagueId)
      } catch (cause) {
        if (String(cause).includes('tournaments_name_unique') || String(cause).includes('tournaments.name')) throw createError({ statusCode: 409, statusMessage: 'Турнир с таким названием уже существует' })
        throw cause
      }
      return this.get(key)
    },
    remove(key: string) {
      const database = useDatabase()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare("DELETE FROM external_entities WHERE entity_type = 'tournament' AND local_id = ?").run(key)
        database.prepare('DELETE FROM tournaments WHERE id = ?').run(key)
        database.exec('COMMIT')
      } catch (cause) {
        database.exec('ROLLBACK')
        throw cause
      }
    }
  },

  leagues: {
    list() {
      return all('SELECT * FROM leagues ORDER BY name COLLATE NOCASE').map(toLeague)
    },
    get(key: string) {
      const row = one('SELECT * FROM leagues WHERE id = ?', key)
      return row ? toLeague(row) : null
    },
    save(input: unknown) {
      const value = parse(leagueSchema, input)
      const key = value.id || id('league')
      const timestamp = now()
      const createdAt = createdAtOf('leagues', value.id) || timestamp
      const database = useDatabase()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(SQL.league).run(key, value.name, value.notes, value.logoAssetId, createdAt, timestamp)
        // Series keep the league name as text too: keep it in step when the league is renamed.
        database.prepare('UPDATE tournaments SET league = ? WHERE league_id = ?').run(value.name, key)
        database.exec('COMMIT')
      } catch (cause) {
        database.exec('ROLLBACK')
        if (String(cause).includes('leagues_name_unique') || String(cause).includes('leagues.name')) throw createError({ statusCode: 409, statusMessage: 'Лига с таким названием уже существует' })
        throw cause
      }
      return this.get(key)
    },
    remove(key: string) {
      const usage = Number(one('SELECT count(*) AS count FROM tournaments WHERE league_id = ?', key)!.count)
      if (usage) throw createError({ statusCode: 409, statusMessage: `Лига используется в ${usage} сериях` })
      useDatabase().prepare('DELETE FROM leagues WHERE id = ?').run(key)
    }
  },

  stages: {
    list() {
      return all('SELECT * FROM stages ORDER BY start_date IS NULL, start_date DESC, name COLLATE NOCASE').map(toStage)
    },
    get(key: string) {
      const row = one('SELECT * FROM stages WHERE id = ?', key)
      return row ? toStage(row) : null
    },
    save(input: unknown) {
      const value = parse(stageSchema, input)
      if (value.seriesId && !one('SELECT id FROM tournaments WHERE id = ?', value.seriesId)) throw createError({ statusCode: 422, statusMessage: 'Серия не найдена' })
      const key = value.id || id('stage')
      const timestamp = now()
      const createdAt = createdAtOf('stages', value.id) || timestamp
      useDatabase().prepare(SQL.stage).run(key, value.name, value.seriesId, value.tier, value.startDate, value.endDate, value.prizePool, value.notes, createdAt, timestamp)
      return this.get(key)
    },
    remove(key: string) {
      useDatabase().prepare('DELETE FROM stages WHERE id = ?').run(key)
    }
  },

  players: {
    list() {
      const refs = externalRefs('player')
      return all('SELECT * FROM players ORDER BY nickname COLLATE NOCASE').map(row => toPlayer(row, refs))
    },
    get(key: string) {
      const row = one('SELECT * FROM players WHERE id = ?', key)
      return row ? toPlayer(row, externalRefs('player', key)) : null
    },
    save(input: unknown) {
      const value = parse(playerSchema, input)
      if (value.teamId && !one('SELECT id FROM teams WHERE id = ?', value.teamId)) throw createError({ statusCode: 422, statusMessage: 'Команда не найдена' })
      const key = value.id || id('player')
      const timestamp = now()
      const createdAt = createdAtOf('players', value.id) || timestamp
      useDatabase().prepare(SQL.player).run(key, value.nickname, value.realName, value.teamId, value.role, value.country, value.notes, value.photoAssetId, createdAt, timestamp)
      return this.get(key)
    },
    remove(key: string) {
      const database = useDatabase()
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare("DELETE FROM external_entities WHERE entity_type = 'player' AND local_id = ?").run(key)
        database.prepare('DELETE FROM players WHERE id = ?').run(key)
        database.exec('COMMIT')
      } catch (cause) {
        database.exec('ROLLBACK')
        throw cause
      }
    }
  },

  heroImages: {
    list: () => all(`${HERO_IMAGE_SELECT} ORDER BY h.hero_id, h.created_at, h.id`).map(toHeroImage),
    get(key: string) {
      const row = one(`${HERO_IMAGE_SELECT} WHERE h.id = ?`, key)
      return row ? toHeroImage(row) : null
    },
    save(input: unknown) {
      const value = parse(heroImageSchema, input)
      const media = one('SELECT mime_type, bytes FROM media WHERE id = ?', value.assetId)
      if (!media) throw createError({ statusCode: 422, statusMessage: 'Изображение не найдено' })
      if (!isImageType(String(media.mime_type))) throw createError({ statusCode: 415, statusMessage: 'Поддерживаются только PNG, JPEG, WebP, GIF и SVG' })
      const key = value.id || id('heroimg')
      const timestamp = now()
      const createdAt = createdAtOf('hero_images', value.id) || timestamp
      // The header is an upper bound (no alpha channel means no transparency); measured pixels refine it, and a
      // rename that sends no measurement keeps what was stored for the same asset.
      const header = detectTransparency(media.bytes as Uint8Array, media.mime_type as Parameters<typeof detectTransparency>[1])
      const previous = value.id ? one('SELECT image_asset_id, has_alpha FROM hero_images WHERE id = ?', value.id) : undefined
      const kept = previous && previous.image_asset_id === value.assetId && previous.has_alpha !== null ? Number(previous.has_alpha) === 1 : undefined
      const transparent = header === false ? false : typeof value.hasAlpha === 'boolean' ? value.hasAlpha : kept ?? header
      useDatabase().prepare(SQL.heroImage).run(key, value.heroId, value.title, value.assetId, transparent === null ? null : Number(transparent), createdAt, timestamp)
      return this.get(key)
    },
    /** Removes the row only. The media asset stays: publications that already use the picture keep it. */
    remove(key: string) {
      useDatabase().prepare('DELETE FROM hero_images WHERE id = ?').run(key)
    }
  },

  matches: {
    list: () => all(`${MATCH_SELECT} ORDER BY m.start_date DESC, m.start_time DESC`).map(toMatch),
    get(key: string) {
      const row = one(`${MATCH_SELECT} WHERE m.id = ?`, key)
      return row ? toMatch(row) : null
    },
    save(input: unknown) {
      const value = parse(matchSchema, input)
      const teamCount = Number(one('SELECT count(*) AS count FROM teams WHERE id IN (?, ?)', value.teamAId, value.teamBId)!.count)
      if (teamCount !== 2) throw createError({ statusCode: 422, statusMessage: 'Одна из команд не найдена' })
      const key = value.id || id('match')
      const timestamp = now()
      const createdAt = createdAtOf('matches', value.id) || timestamp
      const hasScore = value.status !== 'scheduled' && value.status !== 'cancelled'
      const winner = value.status === 'completed' ? value.winnerTeamId : null
      useDatabase().prepare(SQL.match).run(
        key, value.teamAId, value.teamBId, value.tournament, value.stage, value.startDate, value.startTime, value.timezone,
        value.format, value.status, hasScore ? value.scoreA : null, hasScore ? value.scoreB : null, winner, value.notes,
        createdAt, timestamp
      )
      return this.get(key)
    },
    remove(key: string) {
      useDatabase().prepare('DELETE FROM matches WHERE id = ?').run(key)
    }
  },

  drafts: {
    list: (matchId: string) => all('SELECT * FROM drafts WHERE match_id = ? ORDER BY map_number', matchId).map(toDraft),
    find(matchId: string, mapNumber: number) {
      const row = one('SELECT * FROM drafts WHERE match_id = ? AND map_number = ?', matchId, mapNumber)
      return row ? toDraft(row) : null
    },
    save(input: unknown) {
      const value = draftSchema.parse(input)
      const existing = this.find(value.matchId, value.mapNumber) as { id?: string } | null
      const key = existing?.id || value.id || id('draft')
      useDatabase().prepare(SQL.draft).run(key, value.matchId, value.mapNumber, JSON.stringify(value), now())
      return this.find(value.matchId, value.mapNumber)
    }
  },

  projects: {
    list: () => all('SELECT * FROM projects ORDER BY updated_at DESC').map(toProject),
    get(key: string) {
      const row = one('SELECT * FROM projects WHERE id = ?', key)
      return row ? toProject(row) : null
    },
    findByDedupe(key: string) {
      const row = one('SELECT * FROM projects WHERE dedupe_key = ? ORDER BY created_at DESC LIMIT 1', key)
      return row ? toProject(row) : null
    },
    save(input: unknown, note = '') {
      const value = parse(projectSchema, input)
      const database = useDatabase()
      const key = value.id || id('poster')
      const timestamp = now()
      const createdAt = createdAtOf('projects', key) || value.createdAt || timestamp
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(SQL.project).run(
          key, value.title, value.templateId, value.templateVersion, value.matchId,
          JSON.stringify(value.data), JSON.stringify(value.style), value.size, value.thumbnailAssetId,
          value.dedupeKey, value.source ? JSON.stringify(value.source) : null,
          createdAt, timestamp, timestamp
        )
        const saved = this.get(key)!
        database.prepare(SQL.insertRevision).run(id('rev'), key, timestamp, note, JSON.stringify(saved))
        database.prepare(SQL.trimRevisions).run(key, key)
        database.exec('COMMIT')
        return saved
      } catch (cause) {
        database.exec('ROLLBACK')
        throw cause
      }
    },
    remove(key: string) {
      useDatabase().prepare('DELETE FROM projects WHERE id = ?').run(key)
    },
    duplicate(key: string) {
      const source = this.get(key)
      if (!source) throw createError({ statusCode: 404, statusMessage: 'Публикация не найдена' })
      return this.save({ ...structuredClone(source), id: null, createdAt: null, title: `${source.title} (копия)` }, `Копия «${source.title}»`)
    }
  },

  settings: {
    get(key: string, fallback: unknown = null) {
      const row = one('SELECT value_json FROM settings WHERE key = ?', key)
      return row ? json(String(row.value_json)) : fallback
    },
    set(key: string, value: unknown) {
      useDatabase().prepare(SQL.setting).run(key, JSON.stringify(value))
      return value
    }
  }
}
