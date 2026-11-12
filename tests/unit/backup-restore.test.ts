import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, currentBackupVersion, exportBackup, restoreBackup, validateBackup } from '../../server/utils/backup'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { deleteOrphanMedia, findOrphanMedia } from '../../server/utils/media-gc'
import { listProjectSummaries } from '../../server/utils/project-summaries'
import { repository } from '../../server/utils/repository'

let directory = ''
const use = (name: string) => { closeDatabase(); process.env.DOTAFRAME_DATABASE_PATH = join(directory, name) }
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'dotaframe-backup-')); use('a.sqlite') })
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const addMedia = (id: string, createdAt = '2020-01-01T00:00:00.000Z', bytes: Buffer = png) =>
  useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run(id, 'logo', 'image/png', bytes, `${id}.png`, createdAt)
const status = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }

describe('backup export / restore', () => {
  it('round-trips data and images into an empty database', () => {
    addMedia('asset_logo')
    const team = repository.teams.save({ name: 'Alpha', logoAssetId: 'asset_logo' })!
    repository.projects.save({ title: 'P', templateId: 't', templateVersion: 1, data: { logoAssetId: 'asset_logo' }, style: {}, size: '1080x1080' })
    const backup = JSON.parse(JSON.stringify(exportBackup()))
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: currentBackupVersion() })

    use('b.sqlite')
    expect(restoreBackup(backup).restored).toBeGreaterThanOrEqual(4)
    expect(repository.teams.get(team.id as string)).toMatchObject({ name: 'Alpha', logoAssetId: 'asset_logo' })
    expect(repository.projects.list()).toHaveLength(1)
    const media = useDatabase().prepare('SELECT mime_type, bytes FROM media WHERE id = ?').get('asset_logo') as { mime_type: string, bytes: Uint8Array }
    expect(media.mime_type).toBe('image/png')
    expect(Buffer.from(media.bytes).equals(png)).toBe(true)
  })

  it('restores twice without duplicating (upsert)', () => {
    repository.teams.save({ name: 'Alpha' })
    const backup = JSON.parse(JSON.stringify(exportBackup()))
    restoreBackup(backup); restoreBackup(backup)
    expect(repository.teams.list()).toHaveLength(1)
  })
})

describe('backup validation', () => {
  const valid = () => ({ format: BACKUP_FORMAT, version: 1, data: {} })
  it('accepts an old version and rejects foreign, missing and newer versions', () => {
    expect(() => validateBackup(valid())).not.toThrow()
    expect(status(() => validateBackup({ hello: 1 }))).toBe(422)
    expect(status(() => validateBackup({ ...valid(), version: undefined }))).toBe(422)
    expect(status(() => validateBackup({ ...valid(), version: currentBackupVersion() + 1 }))).toBe(422)
  })
  it('rejects unknown tables, non-array tables and rows without a primary key', () => {
    expect(status(() => validateBackup({ ...valid(), data: { evil: [] } }))).toBe(422)
    expect(status(() => validateBackup({ ...valid(), data: { teams: {} } }))).toBe(422)
    expect(status(() => validateBackup({ ...valid(), data: { teams: [{ name: 'x' }] } }))).toBe(422)
  })
  it('rejects media that is not an image and re-derives the stored type from the bytes', () => {
    const media = (bytes: Buffer, mime = 'text/html') => ({ ...valid(), data: { media: [{ id: 'asset_x', kind: 'logo', mime_type: mime, bytes: bytes.toString('base64'), name: 'x', created_at: '2020' }] } })
    expect(status(() => validateBackup(media(Buffer.from('<script>alert(1)</script>'))))).toBe(422)
    expect(validateBackup(media(png)).media![0]!.mime_type).toBe('image/png')
  })
  it('writes nothing when a later row is invalid', () => {
    const bad = { ...valid(), data: { teams: [{ id: 'team_ok', name: 'Fine', short_name: '', region: '', notes: '', created_at: 'x', updated_at: 'x' }], matches: [{ id: 'm1' }] } }
    expect(status(() => restoreBackup(bad))).toBe(422)
    expect(repository.teams.list()).toHaveLength(0)
  })
})

describe('project summaries (bootstrap)', () => {
  it('omit heavy JSON fields but keep what the gallery shows', () => {
    repository.projects.save({ title: 'Big', templateId: 't', templateVersion: 2, data: { big: 'x'.repeat(1000) }, style: { s: 1 }, size: '1080x1080' })
    const [summary] = listProjectSummaries() as Array<Record<string, unknown>>
    expect(summary).toMatchObject({ title: 'Big', templateId: 't', templateVersion: 2, size: '1080x1080' })
    expect(summary).not.toHaveProperty('data')
    expect(summary).not.toHaveProperty('style')
    expect(summary).not.toHaveProperty('source')
    expect(summary!.updatedAt).toBeTruthy()
  })
})

describe('orphan media collection', () => {
  it('finds only unreferenced, non-recent images and keeps ones used anywhere', () => {
    addMedia('asset_team'); addMedia('asset_project'); addMedia('asset_revision_only'); addMedia('asset_setting'); addMedia('asset_orphan')
    addMedia('asset_recent', new Date().toISOString())
    repository.teams.save({ name: 'Alpha', logoAssetId: 'asset_team' })
    const project = repository.projects.save({ title: 'P', templateId: 't', templateVersion: 1, data: { teamA: { logoAssetId: 'asset_project' } }, style: {}, size: 's' })!
    // The image disappears from the current version but must stay alive through the saved revision.
    repository.projects.save({ ...project, data: { teamA: { logoAssetId: 'asset_revision_only' } } })
    repository.projects.save({ ...project, data: {} })
    repository.settings.set('defaults.socials', { avatar: { assetId: 'asset_setting' } })

    const result = findOrphanMedia()
    expect(result.items.map(item => item.id)).toEqual(['asset_orphan'])
    expect(result.bytes).toBe(png.byteLength)
  })
  it('deletes only confirmed ids that are still orphans', () => {
    addMedia('asset_orphan'); addMedia('asset_used')
    repository.teams.save({ name: 'Alpha', logoAssetId: 'asset_used' })
    expect(deleteOrphanMedia(['asset_used', 'asset_orphan', 'asset_unknown'])).toEqual({ removed: 1 })
    const left = (useDatabase().prepare('SELECT id FROM media ORDER BY id').all() as Array<{ id: string }>).map(row => row.id)
    expect(left).toEqual(['asset_used'])
  })
})
