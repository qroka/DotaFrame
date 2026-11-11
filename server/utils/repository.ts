import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { json, useDatabase } from './database'

type Row = Record<string, unknown>
const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${randomUUID()}`

const teamSchema = z.object({
  id: z.string().nullable().optional(), name: z.string().trim().min(1).max(60),
  shortName: z.string().trim().max(12).default(''), region: z.string().trim().max(40).default(''),
  notes: z.string().trim().max(500).default(''), logoAssetId: z.string().nullable().default(null)
})

const matchSchema = z.object({
  id: z.string().nullable().optional(), teamAId: z.string().min(1), teamBId: z.string().min(1),
  tournament: z.string().trim().min(1).max(100), stage: z.string().trim().max(80).default(''),
  startDate: z.iso.date(), startTime: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().min(1),
  format: z.enum(['BO1', 'BO2', 'BO3', 'BO5']), status: z.enum(['scheduled', 'live', 'completed', 'cancelled']),
  scoreA: z.number().int().min(0).max(9).nullable().default(null), scoreB: z.number().int().min(0).max(9).nullable().default(null),
  winnerTeamId: z.string().nullable().default(null), notes: z.string().max(1000).default('')
}).refine(value => value.teamAId !== value.teamBId, { message: 'Выберите разные команды', path: ['teamBId'] })

const projectSchema = z.object({
  id: z.string().nullable().optional(), title: z.string().trim().min(1).max(200), templateId: z.string().min(1),
  templateVersion: z.number().int().positive(), matchId: z.string().nullable().default(null),
  data: z.record(z.string(), z.unknown()), style: z.record(z.string(), z.unknown()), size: z.string().min(1),
  thumbnailAssetId: z.string().nullable().default(null), createdAt: z.string().nullable().optional(),
  dedupeKey: z.string().max(300).nullable().default(null), source: z.record(z.string(), z.unknown()).nullable().default(null)
})

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw createError({ statusCode: 422, statusMessage: result.error.issues[0]?.message || 'Некорректные данные', data: result.error.flatten() })
  return result.data
}

function team(row: Row) {
  const externalRefs = (useDatabase().prepare('SELECT provider, external_id FROM external_entities WHERE entity_type = ? AND local_id = ? ORDER BY provider').all('team', String(row.id)) as Row[])
    .map(ref => ({ provider: ref.provider, externalId: ref.external_id }))
  return { id: row.id, name: row.name, shortName: row.short_name, region: row.region, notes: row.notes, logoAssetId: row.logo_asset_id, createdAt: row.created_at, updatedAt: row.updated_at, externalRefs }
}

function match(row: Row) {
  return { id: row.id, teamAId: row.team_a_id, teamBId: row.team_b_id, tournament: row.tournament, stage: row.stage, startDate: row.start_date, startTime: row.start_time, timezone: row.timezone, format: row.format, status: row.status, scoreA: row.score_a, scoreB: row.score_b, winnerTeamId: row.winner_team_id, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at }
}

function project(row: Row) {
  return { id: row.id, title: row.title, templateId: row.template_id, templateVersion: row.template_version, matchId: row.match_id, data: json(String(row.data_json)), style: json(String(row.style_json)), size: row.size, thumbnailAssetId: row.thumbnail_asset_id, createdAt: row.created_at, updatedAt: row.updated_at, savedAt: row.saved_at, dedupeKey: row.dedupe_key ?? null, source: row.source_json ? json(String(row.source_json)) : null }
}

export const repository = {
  teams: {
    list: () => (useDatabase().prepare('SELECT * FROM teams ORDER BY name COLLATE NOCASE').all() as Row[]).map(team),
    get: (key: string) => { const row = useDatabase().prepare('SELECT * FROM teams WHERE id = ?').get(key) as Row | undefined; return row ? team(row) : null },
    save(input: unknown) {
      const value = parse(teamSchema, input); const database = useDatabase(); const existing = value.id ? database.prepare('SELECT created_at FROM teams WHERE id = ?').get(value.id) as Row | undefined : undefined
      const key = value.id || id('team'); const timestamp = now()
      try { database.prepare(`INSERT INTO teams(id,name,short_name,region,notes,logo_asset_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,short_name=excluded.short_name,region=excluded.region,notes=excluded.notes,logo_asset_id=excluded.logo_asset_id,updated_at=excluded.updated_at`).run(key, value.name, value.shortName, value.region, value.notes, value.logoAssetId, String(existing?.created_at || timestamp), timestamp) }
      catch (cause) { if (String(cause).includes('teams_name_unique')) throw createError({ statusCode: 409, statusMessage: 'Команда с таким названием уже существует' }); throw cause }
      return this.get(key)
    },
    remove(key: string) {
      const usage = Number((useDatabase().prepare('SELECT count(*) count FROM matches WHERE team_a_id = ? OR team_b_id = ?').get(key, key) as Row).count)
      if (usage) throw createError({ statusCode: 409, statusMessage: `Команда используется в ${usage} матч(ах)` })
      useDatabase().prepare('DELETE FROM teams WHERE id = ?').run(key)
    }
  },
  matches: {
    list: () => (useDatabase().prepare('SELECT * FROM matches ORDER BY start_date DESC, start_time DESC').all() as Row[]).map(match),
    get: (key: string) => { const row = useDatabase().prepare('SELECT * FROM matches WHERE id = ?').get(key) as Row | undefined; return row ? match(row) : null },
    save(input: unknown) {
      const value = parse(matchSchema, input); const database = useDatabase()
      const teamCount = Number((database.prepare('SELECT count(*) count FROM teams WHERE id IN (?, ?)').get(value.teamAId, value.teamBId) as Row).count)
      if (teamCount !== 2) throw createError({ statusCode: 422, statusMessage: 'Одна из команд не найдена' })
      const existing = value.id ? database.prepare('SELECT created_at FROM matches WHERE id = ?').get(value.id) as Row | undefined : undefined
      const key = value.id || id('match'); const timestamp = now(); const clearScore = value.status === 'scheduled' || value.status === 'cancelled'
      database.prepare(`INSERT INTO matches(id,team_a_id,team_b_id,tournament,stage,start_date,start_time,timezone,format,status,score_a,score_b,notes,created_at,updated_at,winner_team_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET team_a_id=excluded.team_a_id,team_b_id=excluded.team_b_id,tournament=excluded.tournament,stage=excluded.stage,start_date=excluded.start_date,start_time=excluded.start_time,timezone=excluded.timezone,format=excluded.format,status=excluded.status,score_a=excluded.score_a,score_b=excluded.score_b,notes=excluded.notes,updated_at=excluded.updated_at,winner_team_id=excluded.winner_team_id`).run(key, value.teamAId, value.teamBId, value.tournament, value.stage, value.startDate, value.startTime, value.timezone, value.format, value.status, clearScore ? null : value.scoreA, clearScore ? null : value.scoreB, value.notes, String(existing?.created_at || timestamp), timestamp, value.status === 'completed' ? value.winnerTeamId : null)
      return this.get(key)
    },
    remove(key: string) { useDatabase().prepare('DELETE FROM matches WHERE id = ?').run(key) }
  },
  drafts: {
    list(matchId: string) {
      return (useDatabase().prepare('SELECT * FROM drafts WHERE match_id = ? ORDER BY map_number').all(matchId) as Row[]).map(row => ({ ...json<Record<string, unknown>>(String(row.data_json)), id: row.id, matchId: row.match_id, mapNumber: row.map_number, updatedAt: row.updated_at }))
    },
    find(matchId: string, mapNumber: number) {
      const row = useDatabase().prepare('SELECT * FROM drafts WHERE match_id = ? AND map_number = ?').get(matchId, mapNumber) as Row | undefined
      return row ? { ...json<Record<string, unknown>>(String(row.data_json)), id: row.id, matchId: row.match_id, mapNumber: row.map_number, updatedAt: row.updated_at } : null
    },
    save(input: unknown) {
      const value = z.object({ id: z.string().nullable().optional(), matchId: z.string().min(1), mapNumber: z.number().int().min(1).max(20) }).passthrough().parse(input)
      const existing = this.find(value.matchId, value.mapNumber) as { id?: string } | null
      const key = existing?.id || value.id || id('draft'); const timestamp = now()
      useDatabase().prepare(`INSERT INTO drafts(id,match_id,map_number,data_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(match_id,map_number) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`).run(key, value.matchId, value.mapNumber, JSON.stringify(value), timestamp)
      return this.find(value.matchId, value.mapNumber)
    }
  },
  projects: {
    list: () => (useDatabase().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Row[]).map(project),
    get: (key: string) => { const row = useDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(key) as Row | undefined; return row ? project(row) : null },
    findByDedupe: (key: string) => { const row = useDatabase().prepare('SELECT * FROM projects WHERE dedupe_key = ? ORDER BY created_at DESC LIMIT 1').get(key) as Row | undefined; return row ? project(row) : null },
    save(input: unknown, note = '') {
      const value = parse(projectSchema, input); const database = useDatabase(); const key = value.id || id('poster'); const timestamp = now()
      const existing = database.prepare('SELECT created_at FROM projects WHERE id = ?').get(key) as Row | undefined
      const createdAt = String(existing?.created_at || value.createdAt || timestamp)
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(`INSERT INTO projects(id,title,template_id,template_version,match_id,data_json,style_json,size,thumbnail_asset_id,created_at,updated_at,saved_at,dedupe_key,source_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,template_id=excluded.template_id,template_version=excluded.template_version,match_id=excluded.match_id,data_json=excluded.data_json,style_json=excluded.style_json,size=excluded.size,thumbnail_asset_id=excluded.thumbnail_asset_id,updated_at=excluded.updated_at,saved_at=excluded.saved_at,dedupe_key=excluded.dedupe_key,source_json=excluded.source_json`).run(key, value.title, value.templateId, value.templateVersion, value.matchId, JSON.stringify(value.data), JSON.stringify(value.style), value.size, value.thumbnailAssetId, createdAt, timestamp, timestamp, value.dedupeKey, value.source ? JSON.stringify(value.source) : null)
        const saved = this.get(key)!
        database.prepare('INSERT INTO revisions(id,project_id,saved_at,note,snapshot_json) VALUES(?,?,?,?,?)').run(id('rev'), key, timestamp, note, JSON.stringify(saved))
        database.prepare('DELETE FROM revisions WHERE project_id = ? AND id NOT IN (SELECT id FROM revisions WHERE project_id = ? ORDER BY saved_at DESC LIMIT 30)').run(key, key)
        database.exec('COMMIT')
        return saved
      } catch (cause) { database.exec('ROLLBACK'); throw cause }
    },
    remove(key: string) { useDatabase().prepare('DELETE FROM projects WHERE id = ?').run(key) },
    duplicate(key: string) { const source = this.get(key); if (!source) throw createError({ statusCode: 404, statusMessage: 'Публикация не найдена' }); return this.save({ ...structuredClone(source), id: null, createdAt: null, title: `${source.title} (копия)` }, `Копия «${source.title}»`) }
  },
  settings: {
    get(key: string, fallback: unknown = null) { const row = useDatabase().prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as Row | undefined; return row ? json(String(row.value_json)) : fallback },
    set(key: string, value: unknown) { useDatabase().prepare('INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, JSON.stringify(value)); return value }
  }
}
