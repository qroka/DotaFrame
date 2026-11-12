import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportBackup } from '../../server/utils/backup'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { findOrphanMedia } from '../../server/utils/media-gc'
import { detectTransparency } from '../../server/utils/media'
import { repository } from '../../server/utils/repository'

let directory = ''
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-hero-images-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
const chunk = (name: string, data: number[] = []) => [...u32(data.length), ...[...name].map(char => char.charCodeAt(0)), ...data, 0, 0, 0, 0]
/** Smallest PNG-like header sequence the detector reads: signature, IHDR with a colour type, optional tRNS, IDAT, IEND. */
const png = (colorType: number, { trns = false } = {}) => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...chunk('IHDR', [...u32(2), ...u32(2), 8, colorType, 0, 0, 0]),
  ...(trns ? chunk('tRNS', [0]) : []), ...chunk('IDAT', [0]), ...chunk('IEND')
])
const webp = (kind: 'VP8X' | 'VP8L' | 'VP8 ', flagByte: number) => {
  const bytes = new Uint8Array(30)
  bytes.set([...'RIFF'].map(c => c.charCodeAt(0)), 0)
  bytes.set([...'WEBP'].map(c => c.charCodeAt(0)), 8)
  bytes.set([...kind].map(c => c.charCodeAt(0)), 12)
  bytes[kind === 'VP8X' ? 20 : 24] = flagByte
  return bytes
}
const addMedia = (id: string, bytes: Uint8Array, mime = 'image/png', createdAt = new Date().toISOString()) =>
  useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run(id, 'hero-image', mime, bytes, `${id}.png`, createdAt)
const status = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }

describe('detectTransparency', () => {
  it('reads alpha from the PNG colour type or a tRNS chunk', () => {
    expect(detectTransparency(png(6), 'image/png')).toBe(true)
    expect(detectTransparency(png(4), 'image/png')).toBe(true)
    expect(detectTransparency(png(3, { trns: true }), 'image/png')).toBe(true)
    expect(detectTransparency(png(3), 'image/png')).toBe(false)
    expect(detectTransparency(png(2), 'image/png')).toBe(false)
  })
  it('knows JPEG is opaque, reads WebP flags and gives up on GIF and SVG', () => {
    expect(detectTransparency(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')).toBe(false)
    expect(detectTransparency(webp('VP8X', 0x10), 'image/webp')).toBe(true)
    expect(detectTransparency(webp('VP8X', 0), 'image/webp')).toBe(false)
    expect(detectTransparency(webp('VP8L', 0x10), 'image/webp')).toBe(true)
    expect(detectTransparency(webp('VP8 ', 0), 'image/webp')).toBe(false)
    expect(detectTransparency(new TextEncoder().encode('GIF89a'), 'image/gif')).toBeNull()
    expect(detectTransparency(new TextEncoder().encode('<svg/>'), 'image/svg+xml')).toBeNull()
  })
  it('does not read past the end of a truncated PNG', () => {
    expect(detectTransparency(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBeNull()
    expect(detectTransparency(png(2).subarray(0, 40), 'image/png')).toBe(false)
  })
})

describe('hero image repository', () => {
  it('saves pictures for catalogue heroes, ordered by hero, and records transparency', () => {
    addMedia('asset_a', png(6)); addMedia('asset_b', png(2), 'image/png'); addMedia('asset_c', new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')
    const axe = repository.heroImages.save({ heroId: 2, assetId: 'asset_a', title: ' Axe cut-out ' })!
    const am = repository.heroImages.save({ heroId: 1, assetId: 'asset_b' })!
    const jpeg = repository.heroImages.save({ heroId: 1, assetId: 'asset_c', title: 'photo' })!
    expect(axe).toMatchObject({ heroId: 2, title: 'Axe cut-out', assetId: 'asset_a', mimeType: 'image/png', hasAlpha: true })
    expect(am.hasAlpha).toBe(false)
    expect(jpeg).toMatchObject({ hasAlpha: false, mimeType: 'image/jpeg' })
    expect(repository.heroImages.list().map(image => image.heroId)).toEqual([1, 1, 2])
  })

  it('lets measured pixels refine the header: an RGBA picture can still be fully opaque', () => {
    addMedia('asset_rgba', png(6)); addMedia('asset_rgb', png(2))
    const opaque = repository.heroImages.save({ heroId: 2, assetId: 'asset_rgba', hasAlpha: false })!
    expect(opaque.hasAlpha).toBe(false)
    expect(repository.heroImages.save({ heroId: 2, assetId: 'asset_rgba', hasAlpha: true })!.hasAlpha).toBe(true)
    // Without an alpha channel nothing can be transparent, whatever the client reports.
    expect(repository.heroImages.save({ heroId: 2, assetId: 'asset_rgb', hasAlpha: true })!.hasAlpha).toBe(false)
    // An unmeasured file falls back to the header.
    expect(repository.heroImages.save({ heroId: 2, assetId: 'asset_rgba', hasAlpha: null })!.hasAlpha).toBe(true)
  })

  it('keeps the measured value when a picture is renamed without a new measurement', () => {
    addMedia('asset_rgba', png(6))
    const saved = repository.heroImages.save({ heroId: 2, assetId: 'asset_rgba', title: 'a', hasAlpha: false })!
    expect(repository.heroImages.save({ id: saved.id, heroId: 2, assetId: 'asset_rgba', title: 'b' })).toMatchObject({ title: 'b', hasAlpha: false })
  })

  it('validates the hero, the asset and the title length', () => {
    addMedia('asset_a', png(6))
    expect(status(() => repository.heroImages.save({ heroId: 999999, assetId: 'asset_a' }))).toBe(422)
    expect(status(() => repository.heroImages.save({ heroId: 1, assetId: 'asset_missing' }))).toBe(422)
    expect(status(() => repository.heroImages.save({ heroId: 1, assetId: '' }))).toBe(422)
    expect(status(() => repository.heroImages.save({ heroId: 1, assetId: 'asset_a', title: 'x'.repeat(81) }))).toBe(422)
    useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run('asset_pdf', 'x', 'application/pdf', new Uint8Array([1]), 'a.pdf', 'now')
    expect(status(() => repository.heroImages.save({ heroId: 1, assetId: 'asset_pdf' }))).toBe(415)
  })

  it('renames in place, keeping the creation time and asset', () => {
    addMedia('asset_a', png(6))
    const saved = repository.heroImages.save({ heroId: 8, assetId: 'asset_a', title: 'old' })!
    const renamed = repository.heroImages.save({ id: saved.id, heroId: 8, assetId: 'asset_a', title: 'Juggernaut, key art' })!
    expect(renamed).toMatchObject({ id: saved.id, title: 'Juggernaut, key art', createdAt: saved.createdAt, assetId: 'asset_a' })
    expect(repository.heroImages.list()).toHaveLength(1)
  })

  it('removes the row but keeps the image, so publications that use it are unaffected', () => {
    addMedia('asset_a', png(6), 'image/png', '2020-01-01T00:00:00.000Z')
    const saved = repository.heroImages.save({ heroId: 8, assetId: 'asset_a' })!
    expect(findOrphanMedia(0).items.map(item => item.id)).not.toContain('asset_a')
    repository.heroImages.remove(String(saved.id))
    expect(repository.heroImages.list()).toEqual([])
    expect((useDatabase().prepare('SELECT count(*) count FROM media WHERE id = ?').get('asset_a') as { count: number }).count).toBe(1)
    // A publication using the picture as its player image still keeps it alive.
    repository.projects.save({ title: 'Poster', templateId: 'match-announcement', templateVersion: 1, data: {}, style: { player: { enabled: true, assetId: 'asset_a' } }, size: '1080x1080' })
    expect(findOrphanMedia(0).items.map(item => item.id)).not.toContain('asset_a')
  })

  it('drops the row when its media is deleted and is part of backups', () => {
    addMedia('asset_a', png(6), 'image/png', '2020-01-01T00:00:00.000Z')
    repository.heroImages.save({ heroId: 8, assetId: 'asset_a', title: 'Jugg' })
    expect(exportBackup().data.hero_images).toEqual([expect.objectContaining({ hero_id: 8, title: 'Jugg', image_asset_id: 'asset_a', has_alpha: 1 })])
    useDatabase().prepare('DELETE FROM media WHERE id = ?').run('asset_a')
    expect(repository.heroImages.list()).toEqual([])
  })
})
