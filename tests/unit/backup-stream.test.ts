import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, backupChunks, currentBackupVersion, exportBackup, restoreBackupStream } from '../../server/utils/backup'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { repository } from '../../server/utils/repository'

let directory = ''
const use = (name: string) => { closeDatabase(); process.env.DOTAFRAME_DATABASE_PATH = join(directory, name) }
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'dotaframe-stream-')); use('source.sqlite') })
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const addMedia = (id: string) =>
  useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run(id, 'logo', 'image/png', png, `${id}.png`, '2020-01-01T00:00:00.000Z')

const backupText = () => [...backupChunks()].join('')
/** The text as a byte stream cut into chunks of `size` bytes (splitting multi-byte characters on purpose). */
async function* bytesOf(text: string, size = 7) {
  const bytes = Buffer.from(text)
  for (let offset = 0; offset < bytes.length; offset += size) yield bytes.subarray(offset, offset + size)
}
const statusOf = async (promise: Promise<unknown>) => { try { await promise } catch (error) { return (error as { statusCode?: number }).statusCode } }
const teamCount = () => (useDatabase().prepare('SELECT count(*) AS c FROM teams').get() as { c: number }).c

describe('streaming export', () => {
  it('is valid JSON of the usual shape with one row per line', () => {
    addMedia('asset_one')
    repository.teams.save({ name: 'Команда «Ёлка»', logoAssetId: 'asset_one' })
    const text = backupText()
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ format: BACKUP_FORMAT, version: currentBackupVersion(), layout: 'lines' })
    expect(parsed.data.teams).toHaveLength(1)
    expect(parsed.data.media).toHaveLength(1)
    const lines = text.trimEnd().split('\n')
    expect(lines[0]).toMatch(/,"data":\{$/)
    expect(lines.at(-1)).toBe('}}')
    expect(lines.filter(line => line.startsWith('{"id":"asset_one"'))).toHaveLength(1)
  })

  it('pages through tables larger than a page without losing or repeating rows', () => {
    for (let i = 0; i < 130; i++) repository.teams.save({ name: `Team ${String(i).padStart(3, '0')}` })
    for (let i = 0; i < 8; i++) addMedia(`asset_${i}`)
    const parsed = JSON.parse(backupText())
    expect(parsed.data.teams).toHaveLength(130)
    expect(new Set(parsed.data.teams.map((row: { id: string }) => row.id)).size).toBe(130)
    expect(parsed.data.media.map((row: { id: string }) => row.id)).toEqual([...Array(8).keys()].map(i => `asset_${i}`).sort())
  })

  it('produces the same data as the in-memory export', () => {
    addMedia('asset_one')
    repository.teams.save({ name: 'Alpha', logoAssetId: 'asset_one' })
    const streamed = JSON.parse(backupText())
    expect(streamed.data).toEqual(JSON.parse(JSON.stringify(exportBackup().data)))
  })

  it('reads lazily: the header comes out before any table is touched', () => {
    repository.teams.save({ name: 'Alpha' })
    const chunks = backupChunks()
    expect(chunks.next().value).toMatch(/"data":\{\n$/)
    expect(chunks.next().value).toBe('"media":[\n')
  })
})

describe('streaming restore', () => {
  it('round-trips through tiny chunks, keeping Cyrillic and image bytes intact', async () => {
    addMedia('asset_logo')
    const team = repository.teams.save({ name: 'Команда «Ёлка»', notes: 'Заметка — длинная', logoAssetId: 'asset_logo' })!
    repository.projects.save({ title: 'Постер', templateId: 't', templateVersion: 1, data: { x: 'ёж' }, style: {}, size: 's' })
    const text = backupText()

    use('restored.sqlite')
    expect((await restoreBackupStream(bytesOf(text, 7))).ok).toBe(true)
    expect(repository.teams.get(team.id as string)).toMatchObject({ name: 'Команда «Ёлка»', notes: 'Заметка — длинная', logoAssetId: 'asset_logo' })
    expect(repository.projects.list()[0]).toMatchObject({ title: 'Постер', data: { x: 'ёж' } })
    const media = useDatabase().prepare('SELECT bytes FROM media WHERE id = ?').get('asset_logo') as { bytes: Uint8Array }
    expect(Buffer.from(media.bytes).equals(png)).toBe(true)
  })

  it('still restores older pretty-printed and compact single-object backups', async () => {
    repository.teams.save({ name: 'Alpha' })
    const object = JSON.parse(backupText())
    use('legacy.sqlite')
    expect((await restoreBackupStream(bytesOf(JSON.stringify(object, null, 2), 64))).ok).toBe(true)
    expect(teamCount()).toBe(1)
    use('legacy-compact.sqlite')
    expect((await restoreBackupStream(bytesOf(JSON.stringify(object), 64))).ok).toBe(true)
    expect(teamCount()).toBe(1)
  })

  it('rejects a truncated upload and changes nothing', async () => {
    for (let i = 0; i < 5; i++) repository.teams.save({ name: `Team ${i}` })
    const text = backupText()
    use('truncated.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(text.slice(0, Math.floor(text.length * 0.8)))))).toBe(422)
    expect(teamCount()).toBe(0)
  })

  it('validates rows as they arrive and applies none when a later row is bad', async () => {
    for (let i = 0; i < 3; i++) repository.teams.save({ name: `Team ${i}` })
    const lines = backupText().split('\n')
    const at = lines.findIndex(line => line.startsWith('{"id":"team_'))
    lines[at + 1] = '{"name":"no primary key"},'
    use('bad-row.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(lines.join('\n'))))).toBe(422)
    expect(teamCount()).toBe(0)
  })

  it('rolls back when the database rejects a row (foreign key) after validation passed', async () => {
    repository.teams.save({ name: 'Alpha' })
    const lines = backupText().split('\n')
    const matches = lines.indexOf('"matches":[')
    const orphan = { id: 'match_x', team_a_id: 'nope', team_b_id: 'nope2', tournament: 't', stage: '', start_date: '2026-01-01', start_time: '10:00', timezone: 'UTC', format: 'BO3', status: 'scheduled', notes: '', created_at: 'x', updated_at: 'x' }
    lines.splice(matches + 1, 0, JSON.stringify(orphan))
    use('fk.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(lines.join('\n'))))).toBe(422)
    expect(teamCount()).toBe(0)
  })

  it('rejects newer versions, unknown tables, wrong table order and stray content', async () => {
    repository.teams.save({ name: 'Alpha' })
    const text = backupText()
    use('rules.sqlite')
    const newer = text.replace(/"version":\d+/, `"version":${currentBackupVersion() + 1}`)
    expect(await statusOf(restoreBackupStream(bytesOf(newer)))).toBe(422)
    expect(await statusOf(restoreBackupStream(bytesOf(text.replace('"settings":[', '"evil":['))))).toBe(422)
    expect(await statusOf(restoreBackupStream(bytesOf(`${text}garbage\n`)))).toBe(422)
    expect(await statusOf(restoreBackupStream(bytesOf('')))).toBe(422)
    expect(teamCount()).toBe(0)
  })

  it('refuses tables that arrive out of order', async () => {
    const lines = backupText().split('\n')
    const teams = lines.indexOf('"teams":[')
    const media = lines.indexOf('"media":[')
    // Swap the two table markers: teams now comes before media.
    lines[teams] = '"media":['
    lines[media] = '"teams":['
    use('order.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(lines.join('\n'))))).toBe(422)
  })

  it('refuses a line longer than the limit instead of buffering it', async () => {
    const lines = backupText().split('\n')
    lines.splice(1, 0, '"media":[', JSON.stringify({ id: 'asset_big', bytes: 'A'.repeat(5000) }))
    use('long.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(lines.join('\n')), { maxLineBytes: 1000 }))).toBe(422)
  })

  it('does not accept an image row whose bytes are not an image, even if mime_type claims otherwise', async () => {
    const lines = backupText().split('\n')
    const evil = { id: 'asset_evil', kind: 'logo', mime_type: 'image/png', bytes: Buffer.from('<script>1</script>').toString('base64'), name: 'x', created_at: 'x' }
    lines.splice(lines.indexOf('"media":[') + 1, 0, JSON.stringify(evil))
    use('evil.sqlite')
    expect(await statusOf(restoreBackupStream(bytesOf(lines.join('\n'))))).toBe(422)
  })
})
