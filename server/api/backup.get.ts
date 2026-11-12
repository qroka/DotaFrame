import { Readable } from 'node:stream'
import { sendStream, setHeaders } from 'h3'
import { backupChunks } from '../utils/backup'

/** Streams the backup as JSON, one row at a time, so memory stays flat however large the database is. */
export default defineEventHandler(event => {
  setHeaders(event, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="dotaframe-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    'Cache-Control': 'no-store'
  })
  return sendStream(event, Readable.from(backupChunks(), { objectMode: false }))
})
