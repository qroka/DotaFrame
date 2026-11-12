import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createError } from 'h3'
import { useDatabase } from './database'
import { MAX_IMAGE_BYTES, sniffImageType } from './media'
import { BACKUP_TABLES } from './schema'

export const BACKUP_FORMAT = 'dotaframe-sqlite-backup'

/**
 * File layout. The file is ordinary JSON (`{ format, version, createdAt, layout, data: { table: [rows] } }`),
 * written so that the header, every table marker and every row sit on their own line:
 *
 *   {"format":"…","version":6,"createdAt":"…","layout":"lines","data":{
 *   "media":[
 *   {…row…},
 *   {…row…}
 *   ],
 *   "teams":[
 *   ]
 *   }}
 *
 * Any JSON reader can parse it, and restore can read it line by line without holding the file in memory.
 * Older backups (one object, any whitespace) are still restored by the in-memory path.
 */
const HEADER_LINE = /^\{(.*),"data":\{$/
const TABLE_START = /^"([a-z_]+)":\[$/
/** A media row is at most MAX_IMAGE_BYTES of base64 plus a few hundred bytes of JSON. */
const MAX_LINE_BYTES = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64 * 1024
/** Older single-object backups are parsed in memory; refuse files that cannot be handled that way. */
const MAX_LEGACY_BYTES = 256 * 1024 * 1024
const MEDIA_PAGE_SIZE = 3
const PAGE_SIZE = 50

/** Backup layout version = latest applied schema migration. Files from a newer schema are refused. */
export function currentBackupVersion() {
  const row = useDatabase().prepare('SELECT max(version) AS version FROM schema_migrations').get() as { version: number | null }
  return Number(row.version ?? 0)
}

type Row = Record<string, unknown>
const reject = (message: string): never => { throw createError({ statusCode: 422, statusMessage: message }) }
const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/* ---------- Export (streaming) ---------- */

/** Rows of one table, a small page per query: no cursor stays open while the response is being sent. */
function* tableRows(table: string, primaryKey: string, pageSize: number): Generator<Row> {
  const database = useDatabase()
  let last: string | null = null
  for (;;) {
    const rows = (last === null
      ? database.prepare(`SELECT * FROM ${table} ORDER BY ${primaryKey} LIMIT ?`).all(pageSize)
      : database.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} > ? ORDER BY ${primaryKey} LIMIT ?`).all(last, pageSize)) as Row[]
    yield* rows
    if (rows.length < pageSize) return
    last = String(rows[rows.length - 1]![primaryKey])
  }
}

function exportRow(table: string, row: Row): Row {
  return table === 'media' ? { ...row, bytes: Buffer.from(row.bytes as Uint8Array).toString('base64') } : row
}

/** The backup as text chunks (one row per chunk). Memory use is bounded by a page of rows, not by the database size. */
export function* backupChunks(): Generator<string> {
  const names = Object.keys(BACKUP_TABLES) as Array<keyof typeof BACKUP_TABLES>
  const header = JSON.stringify({ format: BACKUP_FORMAT, version: currentBackupVersion(), createdAt: new Date().toISOString(), layout: 'lines' })
  yield `${header.slice(0, -1)},"data":{\n`
  for (const [index, table] of names.entries()) {
    yield `"${table}":[\n`
    let pending: string | null = null
    for (const row of tableRows(table, BACKUP_TABLES[table].primaryKey, table === 'media' ? MEDIA_PAGE_SIZE : PAGE_SIZE)) {
      if (pending !== null) yield `${pending},\n`
      pending = JSON.stringify(exportRow(table, row))
    }
    if (pending !== null) yield `${pending}\n`
    yield index === names.length - 1 ? ']\n' : '],\n'
  }
  yield '}}\n'
}

/** The whole backup as one object. Convenient for tests and small databases; the API streams `backupChunks()` instead. */
export function exportBackup() {
  const data = Object.fromEntries(Object.entries(BACKUP_TABLES).map(([table, { primaryKey }]) => [
    table, [...tableRows(table, primaryKey, PAGE_SIZE)].map(row => exportRow(table, row))
  ]))
  return { format: BACKUP_FORMAT, version: currentBackupVersion(), createdAt: new Date().toISOString(), data }
}

/* ---------- Validation ---------- */

function validateHeader(header: unknown): void {
  if (!isRecord(header) || header.format !== BACKUP_FORMAT) return reject('Это не резервная копия DotaFrame')
  if (!Number.isInteger(header.version) || (header.version as number) < 1) return reject('В резервной копии не указана версия')
  const supported = currentBackupVersion()
  if ((header.version as number) > supported) return reject(`Копия создана более новой версией DotaFrame (формат ${header.version}, поддерживается до ${supported})`)
}

/** Checks one row. Image rows get their type from the bytes (a crafted `mime_type` is never kept). */
function validateRow(table: string, row: unknown, position: number | string): Row {
  const definition = BACKUP_TABLES[table as keyof typeof BACKUP_TABLES]
  if (!definition) return reject(`В копии есть неизвестная таблица: ${table}`)
  const { primaryKey } = definition
  if (!isRecord(row) || typeof row[primaryKey] !== 'string' || !row[primaryKey]) return reject(`Таблица ${table}, запись ${position}: нет значения ${primaryKey}`)
  if (table !== 'media') return row
  const bytes = typeof row.bytes === 'string' ? Buffer.from(row.bytes, 'base64') : null
  if (!bytes?.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return reject(`Изображение ${row.id}: пустой или слишком большой файл`)
  const mimeType = sniffImageType(bytes)
  if (!mimeType) return reject(`Изображение ${row.id}: содержимое не является поддерживаемым изображением`)
  return { ...row, mime_type: mimeType }
}

/** Validates a whole single-object backup before anything is written; returns the rows per table. */
export function validateBackup(input: unknown): Record<string, Row[]> {
  if (!isRecord(input) || !isRecord(input.data)) return reject('Это не резервная копия DotaFrame')
  validateHeader(input)
  const unknown = Object.keys(input.data).filter(table => !(table in BACKUP_TABLES))
  if (unknown.length) return reject(`В копии есть неизвестные таблицы: ${unknown.join(', ')}`)

  const tables: Record<string, Row[]> = {}
  for (const table of Object.keys(BACKUP_TABLES)) {
    const rows = (input.data as Row)[table] ?? []
    if (!Array.isArray(rows)) return reject(`Таблица ${table} в копии повреждена`)
    tables[table] = rows.map((row, index) => validateRow(table, row, index + 1))
  }
  return tables
}

/* ---------- Restore ---------- */

const insertSql = (table: string) => {
  const { primaryKey, columns } = BACKUP_TABLES[table as keyof typeof BACKUP_TABLES]
  const updates = columns.filter(column => column !== primaryKey).map(column => `${column}=excluded.${column}`).join(',')
  return `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates}`
}

/**
 * Applies validated rows in one transaction (upsert by primary key). Everything here is synchronous, so no other
 * request can run inside the transaction, and a failure rolls back every row.
 */
function applyRows(rows: Iterable<{ table: string, row: Row }>): { ok: true, restored: number } {
  const database = useDatabase()
  const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>()
  let restored = 0
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const { table, row } of rows) {
      let statement = statements.get(table)
      if (!statement) statements.set(table, statement = database.prepare(insertSql(table)))
      const columns = BACKUP_TABLES[table as keyof typeof BACKUP_TABLES].columns
      statement.run(...columns.map(column => table === 'media' && column === 'bytes' && typeof row[column] === 'string' ? Buffer.from(row[column] as string, 'base64') : row[column] ?? null) as any[])
      restored++
    }
    database.exec('COMMIT')
    return { ok: true, restored }
  } catch (cause) {
    database.exec('ROLLBACK')
    throw createError({ statusCode: 422, statusMessage: `Не удалось восстановить резервную копию: ${cause instanceof Error ? cause.message : String(cause)}` })
  }
}

/** Merges a single-object backup (any older file, or a small JSON body). */
export function restoreBackup(input: unknown) {
  const tables = validateBackup(input)
  return applyRows(Object.entries(tables).flatMap(([table, rows]) => rows.map(row => ({ table, row }))))
}

const asBuffer = (chunk: unknown): Buffer => typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.isBuffer(chunk) ? chunk : Buffer.from((chunk as Uint8Array).buffer, (chunk as Uint8Array).byteOffset, (chunk as Uint8Array).byteLength)

/** Splits a byte stream into lines. A line longer than `maxLineBytes` is an error, so a hostile body cannot fill memory. */
async function* readLines(source: AsyncIterable<unknown>, maxLineBytes: number): AsyncGenerator<string> {
  let pieces: Buffer[] = []
  let size = 0
  const tooLong = () => reject('В резервной копии слишком длинная строка: файл повреждён или это не копия DotaFrame')
  for await (const chunk of source) {
    const buffer = asBuffer(chunk)
    let start = 0
    for (;;) {
      const newline = buffer.indexOf(0x0a, start)
      const end = newline === -1 ? buffer.length : newline
      size += end - start
      if (size > maxLineBytes) tooLong()
      pieces.push(buffer.subarray(start, end))
      if (newline === -1) break
      yield Buffer.concat(pieces).toString('utf8')
      pieces = []
      size = 0
      start = newline + 1
    }
  }
  if (size > 0) yield Buffer.concat(pieces).toString('utf8')
}

/**
 * Restores a backup from a byte stream.
 *
 * Lines-layout files are validated row by row while being read and parked in a temporary SQLite file on disk;
 * the main database is touched only after the file has been read to its closing line and found valid, then all rows are
 * applied in one synchronous transaction. A truncated, corrupt or oversized upload therefore changes nothing.
 * Anything else is treated as an older single-object backup and parsed in memory.
 */
export async function restoreBackupStream(source: AsyncIterable<unknown>, { maxLineBytes = MAX_LINE_BYTES, maxLegacyBytes = MAX_LEGACY_BYTES } = {}) {
  const lines = readLines(source, maxLineBytes)
  const first = await lines.next()
  const firstLine = first.done ? '' : first.value.replace(/^﻿/, '').replace(/\r$/, '')
  const headerMatch = HEADER_LINE.exec(firstLine)
  if (!headerMatch) return restoreLegacyText(firstLine, lines, maxLegacyBytes)

  let header: unknown
  try { header = JSON.parse(`{${headerMatch[1]}}`) } catch { return reject('Заголовок резервной копии повреждён') }
  validateHeader(header)

  const directory = mkdtempSync(join(tmpdir(), 'dotaframe-restore-'))
  const staging = new DatabaseSync(join(directory, 'staged.sqlite'))
  try {
    staging.exec('CREATE TABLE staged (seq INTEGER PRIMARY KEY, tbl TEXT NOT NULL, json TEXT NOT NULL)')
    const insert = staging.prepare('INSERT INTO staged (tbl, json) VALUES (?, ?)')
    const order = Object.keys(BACKUP_TABLES)
    const corrupt = (lineNumber: number) => reject(`Файл резервной копии повреждён (строка ${lineNumber})`)

    let lineNumber = 1
    let currentTable: string | null = null
    let tableIndex = -1
    let rowsInTable = 0
    let expectNextTable = true
    let finished = false
    staging.exec('BEGIN')
    for await (const raw of lines) {
      lineNumber++
      const line = raw.replace(/\r$/, '')
      if (finished) { if (line.trim()) corrupt(lineNumber); continue }
      if (currentTable === null) {
        // After `],` another table follows; after the last table's `]` only the closing line is valid.
        if (!expectNextTable) {
          if (line === '}}') finished = true
          else corrupt(lineNumber)
          continue
        }
        const start = TABLE_START.exec(line)
        if (!start) { corrupt(lineNumber); continue }
        const name = start[1]!
        const position = order.indexOf(name)
        if (position === -1) { reject(`В копии есть неизвестная таблица: ${name}`); continue }
        if (position <= tableIndex) { reject(`Таблица ${name} встречается в копии не в том порядке`); continue }
        currentTable = name
        tableIndex = position
        rowsInTable = 0
        continue
      }
      if (line === ']' || line === '],') {
        currentTable = null
        expectNextTable = line === '],'
        continue
      }
      let row: unknown
      try { row = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line) } catch { corrupt(lineNumber); continue }
      rowsInTable++
      insert.run(currentTable, JSON.stringify(validateRow(currentTable, row, rowsInTable)))
    }
    if (!finished) return reject('Файл резервной копии оборван: нет закрывающих строк. Скачайте копию заново')
    staging.exec('COMMIT')

    const staged = staging.prepare('SELECT tbl, json FROM staged ORDER BY seq').iterate() as Iterable<{ tbl: string, json: string }>
    return applyRows((function* () { for (const { tbl, json } of staged) yield { table: tbl, row: JSON.parse(json) as Row } })())
  } finally {
    try { staging.close() } catch { /* already closed */ }
    try { rmSync(directory, { recursive: true, force: true }) } catch { /* temp files are removed by the OS eventually */ }
  }
}

async function restoreLegacyText(firstLine: string, rest: AsyncGenerator<string>, maxBytes: number) {
  const parts = [firstLine]
  let bytes = Buffer.byteLength(firstLine)
  for await (const line of rest) {
    bytes += Buffer.byteLength(line) + 1
    if (bytes > maxBytes) return reject('Файл слишком велик для старого формата копии. Создайте копию заново в текущей версии')
    parts.push(line)
  }
  let parsed: unknown
  try { parsed = JSON.parse(parts.join('\n')) } catch { return reject('Это не резервная копия DotaFrame') }
  return restoreBackup(parsed)
}
