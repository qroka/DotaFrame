import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { json, useDatabase } from './database'

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

/* ---------- Row mappers ---------- */

type ExternalRef = { provider: unknown, externalId: unknown }

/** Team external refs for all teams (no argument) or one team, grouped by local id in a single query. */
function teamRefs(localId?: string): Map<string, ExternalRef[]> {
  const filter = localId ? ' AND local_id = ?' : ''
  const rows = all(`SELECT local_id, provider, external_id FROM external_entities WHERE entity_type = 'team'${filter} ORDER BY provider`, ...(localId ? [localId] : []))
  const byTeam = new Map<string, ExternalRef[]>()
  for (const row of rows) {
    const key = String(row.local_id)
    byTeam.set(key, [...(byTeam.get(key) ?? []), { provider: row.provider, externalId: row.external_id }])
  }
  return byTeam
}

function toTeam(row: Row, refs: Map<string, ExternalRef[]>) {
  return {
    id: row.id, name: row.name, shortName: row.short_name, region: row.region, notes: row.notes,
    logoAssetId: row.logo_asset_id, createdAt: row.created_at, updatedAt: row.updated_at,
    externalRefs: refs.get(String(row.id)) ?? []
  }
}

function toMatch(row: Row) {
  return {
    id: row.id, teamAId: row.team_a_id, teamBId: row.team_b_id, tournament: row.tournament, stage: row.stage,
    startDate: row.start_date, startTime: row.start_time, timezone: row.timezone, format: row.format, status: row.status,
    scoreA: row.score_a, scoreB: row.score_b, winnerTeamId: row.winner_team_id, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

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
      const refs = teamRefs()
      return all('SELECT * FROM teams ORDER BY name COLLATE NOCASE').map(row => toTeam(row, refs))
    },
    get(key: string) {
      const row = one('SELECT * FROM teams WHERE id = ?', key)
      return row ? toTeam(row, teamRefs(key)) : null
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

  matches: {
    list: () => all('SELECT * FROM matches ORDER BY start_date DESC, start_time DESC').map(toMatch),
    get(key: string) {
      const row = one('SELECT * FROM matches WHERE id = ?', key)
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
