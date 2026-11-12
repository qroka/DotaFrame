import { useDatabase } from './database'
import { BACKUP_TABLES } from './schema'

type Row = Record<string, unknown>

/** Images uploaded more recently than this are never collected: they may belong to an editor that has not saved yet. */
export const MEDIA_GRACE_HOURS = 24

/**
 * Derived from the backup schema so new tables are covered automatically:
 * every `*_asset_id` column is a reference, every `*_json` column may contain asset ids as text.
 */
const columnsMatching = (pattern: RegExp): Array<[table: string, column: string]> =>
  Object.entries(BACKUP_TABLES).flatMap(([table, { columns }]) => columns.filter(column => pattern.test(column)).map(column => [table, column] as [string, string]))
const FOREIGN_KEYS = columnsMatching(/_asset_id$/)
const TEXT_COLUMNS = columnsMatching(/_json$/)
/**
 * Media that nothing refers to. Deliberately conservative: a candidate counts as used if its id appears
 * in any foreign key or anywhere as plain text inside any JSON column (current data, revisions, settings),
 * so historical snapshots keep their images alive. Ids are searched as substrings, never parsed out of
 * the text, so an unusual id format can only make the result smaller, not wrong.
 */
export function findOrphanMedia(graceHours = MEDIA_GRACE_HOURS, nowMs = Date.now()) {
  const database = useDatabase()
  const cutoff = new Date(nowMs - graceHours * 3600_000).toISOString()
  const candidates = new Map((database.prepare('SELECT id, name, kind, length(bytes) AS size, created_at FROM media WHERE created_at < ?').all(cutoff) as Row[])
    .map(row => [String(row.id), { id: String(row.id), name: String(row.name), kind: String(row.kind), size: Number(row.size), createdAt: String(row.created_at) }]))

  for (const [table, column] of FOREIGN_KEYS) {
    if (!candidates.size) break
    for (const row of database.prepare(`SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`).all() as Row[]) candidates.delete(String(row.value))
  }
  for (const [table, column] of TEXT_COLUMNS) {
    if (!candidates.size) break
    for (const row of database.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`).iterate() as Iterable<Row>) {
      const text = String(row.value)
      for (const id of candidates.keys()) if (text.includes(id)) candidates.delete(id)
      if (!candidates.size) break
    }
  }
  const items = [...candidates.values()]
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.size, 0), items }
}

export function deleteOrphanMedia(ids: string[]) {
  const database = useDatabase()
  const allowed = new Set(findOrphanMedia().items.map(item => item.id))
  const statement = database.prepare('DELETE FROM media WHERE id = ?')
  let removed = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const id of ids) if (allowed.has(id)) { statement.run(id); removed++ }
    database.exec('COMMIT')
  } catch (cause) { database.exec('ROLLBACK'); throw cause }
  return { removed }
}
