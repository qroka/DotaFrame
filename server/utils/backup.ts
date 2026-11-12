import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { useDatabase } from './database'
import { MAX_IMAGE_BYTES, sniffImageType } from './media'
import { BACKUP_TABLES } from './schema'

export const BACKUP_FORMAT = 'dotaframe-sqlite-backup'
/** Backup layout version = latest applied schema migration. Files from a newer schema are refused. */
export function currentBackupVersion() {
  const row = useDatabase().prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null }
  return Number(row.version ?? 0)
}

type Row = Record<string, unknown>
const reject = (message: string): never => { throw createError({ statusCode: 422, statusMessage: message }) }
const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

export function exportBackup() {
  const database = useDatabase()
  const data = Object.fromEntries(Object.keys(BACKUP_TABLES).map(table => {
    const rows = database.prepare(`SELECT * FROM ${table}`).all() as Row[]
    return [table, rows.map(row => table === 'media' ? { ...row, bytes: Buffer.from(row.bytes as Uint8Array).toString('base64') } : row)]
  }))
  return { format: BACKUP_FORMAT, version: currentBackupVersion(), createdAt: new Date().toISOString(), data }
}

/** Validates the whole file before anything is written; returns rows per table ready for insertion. */
export function validateBackup(input: unknown): Record<string, Row[]> {
  if (!isRecord(input) || input.format !== BACKUP_FORMAT || !isRecord(input.data)) return reject('Это не резервная копия DotaFrame')
  if (!Number.isInteger(input.version) || (input.version as number) < 1) return reject('В резервной копии не указана версия')
  const supported = currentBackupVersion()
  if ((input.version as number) > supported) return reject(`Копия создана более новой версией DotaFrame (формат ${input.version}, поддерживается до ${supported})`)

  const unknown = Object.keys(input.data).filter(table => !(table in BACKUP_TABLES))
  if (unknown.length) return reject(`В копии есть неизвестные таблицы: ${unknown.join(', ')}`)

  const tables: Record<string, Row[]> = {}
  for (const [table, { primaryKey }] of Object.entries(BACKUP_TABLES)) {
    const rows = (input.data as Row)[table] ?? []
    if (!Array.isArray(rows)) return reject(`Таблица ${table} в копии повреждена`)
    tables[table] = rows.map((row, index) => {
      if (!isRecord(row) || typeof row[primaryKey] !== 'string' || !row[primaryKey]) return reject(`Таблица ${table}, запись ${index + 1}: нет значения ${primaryKey}`)
      if (table !== 'media') return row
      const bytes = typeof row.bytes === 'string' ? Buffer.from(row.bytes, 'base64') : null
      if (!bytes?.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return reject(`Изображение ${row.id}: пустой или слишком большой файл`)
      const mimeType = sniffImageType(bytes)
      if (!mimeType) return reject(`Изображение ${row.id}: содержимое не является поддерживаемым изображением`)
      return { ...row, bytes, mime_type: mimeType }
    })
  }
  return tables
}

/** Merges a backup into the database in one transaction (upsert by primary key). */
export function restoreBackup(input: unknown) {
  const tables = validateBackup(input)
  const database = useDatabase()
  let restored = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const [table, { primaryKey, columns }] of Object.entries(BACKUP_TABLES)) {
      const updates = columns.filter(column => column !== primaryKey).map(column => `${column}=excluded.${column}`).join(',')
      const statement = database.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates}`)
      for (const row of tables[table] ?? []) {
        statement.run(...columns.map(column => row[column] ?? null) as any[])
        restored++
      }
    }
    database.exec('COMMIT')
    return { ok: true, restored }
  } catch (cause) {
    database.exec('ROLLBACK')
    throw createError({ statusCode: 422, statusMessage: `Не удалось восстановить резервную копию: ${cause instanceof Error ? cause.message : String(cause)}` })
  }
}
