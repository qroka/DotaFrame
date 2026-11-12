import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { BACKUP_TABLES } from '../../server/utils/schema'

let directory = ''
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-schema-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

describe('backup table definitions', () => {
  it('match the live SQLite schema exactly (every table, column and primary key)', () => {
    const database = useDatabase()
    const live = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'").all() as Array<{ name: string }>).map(row => row.name).sort()
    expect(Object.keys(BACKUP_TABLES).sort()).toEqual(live)
    for (const [table, definition] of Object.entries(BACKUP_TABLES)) {
      const info = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string, pk: number }>
      expect([...definition.columns].sort(), table).toEqual(info.map(column => column.name).sort())
      expect(info.find(column => column.pk === 1)?.name, table).toBe(definition.primaryKey)
    }
  })
})
