import { Buffer } from 'node:buffer'
import { createError } from 'h3'
import { useDatabase } from '../utils/database'
import { BACKUP_TABLES } from '../utils/schema'

export default defineEventHandler(async event => {
  const backup = await readBody(event) as { format?: string, data?: Record<string, Array<Record<string, unknown>>> }
  if (backup.format !== 'dotaframe-sqlite-backup' || !backup.data) throw createError({ statusCode: 422, statusMessage: 'Это не резервная копия DotaFrame' })
  const database = useDatabase(); let restored = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const [table, { primaryKey, columns }] of Object.entries(BACKUP_TABLES)) {
      const updates = columns.filter(column => column !== primaryKey).map(column => `${column}=excluded.${column}`).join(',')
      const statement = database.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates}`)
      for (const row of backup.data[table] ?? []) {
        const values = columns.map(column => table === 'media' && column === 'bytes' ? Buffer.from(String(row[column]), 'base64') : row[column] ?? null)
        statement.run(...values as any[]); restored++
      }
    }
    database.exec('COMMIT')
    return { ok: true, restored }
  } catch (cause) { database.exec('ROLLBACK'); throw createError({ statusCode: 422, statusMessage: 'Не удалось восстановить резервную копию', cause }) }
})
