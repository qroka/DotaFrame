import { Buffer } from 'node:buffer'
import { useDatabase } from '../utils/database'

const tables = ['media', 'teams', 'matches', 'drafts', 'projects', 'revisions', 'settings', 'external_entities', 'match_games'] as const

export default defineEventHandler(() => {
  const database = useDatabase()
  const data = Object.fromEntries(tables.map(table => {
    const rows = database.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>
    return [table, rows.map(row => table === 'media' ? { ...row, bytes: Buffer.from(row.bytes as Uint8Array).toString('base64') } : row)]
  }))
  return { format: 'dotaframe-sqlite-backup', version: 3, createdAt: new Date().toISOString(), data }
})
