import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { useDatabase } from '../utils/database'

const columns: Record<string, string[]> = {
  media: ['id', 'kind', 'mime_type', 'bytes', 'width', 'height', 'name', 'created_at'],
  teams: ['id', 'name', 'short_name', 'region', 'notes', 'logo_asset_id', 'created_at', 'updated_at'],
  matches: ['id', 'team_a_id', 'team_b_id', 'tournament', 'stage', 'start_date', 'start_time', 'timezone', 'format', 'status', 'score_a', 'score_b', 'notes', 'created_at', 'updated_at', 'winner_team_id'],
  drafts: ['id', 'match_id', 'map_number', 'data_json', 'updated_at'],
  projects: ['id', 'title', 'template_id', 'template_version', 'match_id', 'data_json', 'style_json', 'size', 'thumbnail_asset_id', 'created_at', 'updated_at', 'saved_at', 'dedupe_key', 'source_json'],
  revisions: ['id', 'project_id', 'saved_at', 'note', 'snapshot_json'],
  settings: ['key', 'value_json'],
  external_entities: ['id', 'provider', 'entity_type', 'external_id', 'local_id', 'synced_at', 'metadata_json'],
  match_games: ['id', 'match_id', 'provider', 'external_id', 'map_number', 'status', 'winner_team_id', 'begin_at', 'end_at', 'created_at', 'updated_at', 'stats_provider', 'stats_external_id', 'stats_json']
}
const primaryKeys: Record<string, string> = { media: 'id', teams: 'id', matches: 'id', drafts: 'id', projects: 'id', revisions: 'id', settings: 'key', external_entities: 'id', match_games: 'id' }

export default defineEventHandler(async event => {
  const backup = await readBody(event) as { format?: string, data?: Record<string, Array<Record<string, unknown>>> }
  if (backup.format !== 'dotaframe-sqlite-backup' || !backup.data) throw createError({ statusCode: 422, statusMessage: 'Это не резервная копия DotaFrame' })
  const database = useDatabase(); let restored = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const [table, keys] of Object.entries(columns)) {
      const primary = primaryKeys[table]
      const updates = keys.filter(key => key !== primary).map(key => `${key}=excluded.${key}`).join(',')
      const statement = database.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')}) ON CONFLICT(${primary}) DO UPDATE SET ${updates}`)
      for (const row of backup.data[table] ?? []) {
        const values = keys.map(key => table === 'media' && key === 'bytes' ? Buffer.from(String(row[key]), 'base64') : row[key] ?? null)
        statement.run(...values as any[]); restored++
      }
    }
    database.exec('COMMIT')
    return { ok: true, restored }
  } catch (cause) { database.exec('ROLLBACK'); throw createError({ statusCode: 422, statusMessage: 'Не удалось восстановить резервную копию', cause }) }
})
