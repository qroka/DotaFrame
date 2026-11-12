import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { repository } from '../../server/utils/repository'

let directory = ''
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-repo-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const team = (name: string) => repository.teams.save({ name })!
const matchInput = (a: string, b: string, patch: Record<string, unknown> = {}) => ({
  teamAId: a, teamBId: b, tournament: 'Cup', startDate: '2026-11-12', startTime: '18:00', timezone: 'Europe/Moscow',
  format: 'BO3', status: 'scheduled', ...patch
})
const projectInput = (patch: Record<string, unknown> = {}) => ({
  title: 'Poster', templateId: 'match-announcement', templateVersion: 1, data: { a: 1 }, style: { b: 2 }, size: '1080x1080', ...patch
})
const code = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }

describe('teams', () => {
  it('saves, lists case-insensitively sorted, and maps columns', () => {
    const b = team('beta'); const a = team('Alpha')
    expect(repository.teams.list().map(t => t.name)).toEqual(['Alpha', 'beta'])
    expect(repository.teams.get(a.id as string)).toMatchObject({ name: 'Alpha', shortName: '', region: '', notes: '', logoAssetId: null, externalRefs: [] })
    expect(b.createdAt).toBeTruthy()
  })
  it('keeps createdAt on update', () => {
    const created = team('Alpha')
    const updated = repository.teams.save({ id: created.id, name: 'Alpha', shortName: 'ALP' })!
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.shortName).toBe('ALP')
  })
  it('rejects duplicate names (409) and invalid input (422)', () => {
    team('Alpha')
    expect(code(() => repository.teams.save({ name: 'ALPHA' }))).toBe(409)
    expect(code(() => repository.teams.save({ name: '  ' }))).toBe(422)
  })
  it('refuses to delete a team used in a match (409)', () => {
    const a = team('A'); const b = team('B'); const c = team('C')
    repository.matches.save(matchInput(a.id as string, b.id as string))
    expect(code(() => repository.teams.remove(a.id as string))).toBe(409)
    repository.teams.remove(c.id as string)
    expect(repository.teams.get(c.id as string)).toBeNull()
  })
  it('returns external refs for each team in list and get', () => {
    const a = team('A'); const b = team('B')
    const insert = useDatabase().prepare('INSERT INTO external_entities(id,provider,entity_type,external_id,local_id,synced_at) VALUES(?,?,?,?,?,?)')
    insert.run('e1', 'pandascore', 'team', '10', a.id as string, 'x')
    insert.run('e2', 'pandascore', 'match', '99', a.id as string, 'x')
    const byName = Object.fromEntries(repository.teams.list().map(t => [t.name, t.externalRefs]))
    expect(byName.A).toEqual([{ provider: 'pandascore', externalId: '10' }])
    expect(byName.B).toEqual([])
    expect(repository.teams.get(a.id as string)!.externalRefs).toEqual([{ provider: 'pandascore', externalId: '10' }])
    expect(b.id).toBeTruthy()
  })
})

describe('matches', () => {
  it('saves and lists newest first', () => {
    const a = team('A'); const b = team('B')
    const early = repository.matches.save(matchInput(a.id as string, b.id as string, { startDate: '2026-11-01' }))!
    const late = repository.matches.save(matchInput(a.id as string, b.id as string, { startDate: '2026-12-01' }))!
    expect(repository.matches.list().map(m => m.id)).toEqual([late.id, early.id])
    expect(early).toMatchObject({ teamAId: a.id, format: 'BO3', status: 'scheduled', scoreA: null, winnerTeamId: null })
  })
  it('clears score for scheduled/cancelled and winner unless completed', () => {
    const a = team('A'); const b = team('B')
    const scheduled = repository.matches.save(matchInput(a.id as string, b.id as string, { scoreA: 2, scoreB: 1, winnerTeamId: a.id }))!
    expect(scheduled).toMatchObject({ scoreA: null, scoreB: null, winnerTeamId: null })
    const live = repository.matches.save(matchInput(a.id as string, b.id as string, { status: 'live', scoreA: 1, scoreB: 0, winnerTeamId: a.id }))!
    expect(live).toMatchObject({ scoreA: 1, scoreB: 0, winnerTeamId: null })
    const done = repository.matches.save(matchInput(a.id as string, b.id as string, { status: 'completed', scoreA: 2, scoreB: 1, winnerTeamId: a.id }))!
    expect(done).toMatchObject({ scoreA: 2, scoreB: 1, winnerTeamId: a.id })
  })
  it('validates teams and keeps createdAt on update', () => {
    const a = team('A'); const b = team('B')
    expect(code(() => repository.matches.save(matchInput(a.id as string, a.id as string)))).toBe(422)
    expect(code(() => repository.matches.save(matchInput(a.id as string, 'missing')))).toBe(422)
    const created = repository.matches.save(matchInput(a.id as string, b.id as string))!
    const updated = repository.matches.save({ ...matchInput(a.id as string, b.id as string, { tournament: 'New' }), id: created.id })!
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.tournament).toBe('New')
  })
  it('removes a match with its drafts', () => {
    const a = team('A'); const b = team('B')
    const m = repository.matches.save(matchInput(a.id as string, b.id as string))!
    repository.drafts.save({ matchId: m.id, mapNumber: 1, picks: [1] })
    repository.matches.remove(m.id as string)
    expect(repository.matches.get(m.id as string)).toBeNull()
    expect(repository.drafts.list(m.id as string)).toEqual([])
  })
})

describe('drafts', () => {
  it('upserts one draft per match and map, preserving custom fields', () => {
    const a = team('A'); const b = team('B')
    const m = repository.matches.save(matchInput(a.id as string, b.id as string))!
    const first = repository.drafts.save({ matchId: m.id, mapNumber: 1, picksRadiant: [1, 2] }) as Record<string, unknown>
    const second = repository.drafts.save({ matchId: m.id, mapNumber: 1, picksRadiant: [3] }) as Record<string, unknown>
    repository.drafts.save({ matchId: m.id, mapNumber: 2 })
    expect(second.id).toBe(first.id)
    expect(second.picksRadiant).toEqual([3])
    expect(repository.drafts.list(m.id as string).map(d => d.mapNumber)).toEqual([1, 2])
    expect(repository.drafts.find(m.id as string, 3)).toBeNull()
  })
})

describe('projects', () => {
  it('saves, parses JSON fields and lists by updatedAt desc', () => {
    const first = repository.projects.save(projectInput({ title: 'One' }))!
    const second = repository.projects.save(projectInput({ title: 'Two' }))!
    repository.projects.save({ ...projectInput({ title: 'One edited' }), id: first.id })
    expect(repository.projects.get(second.id as string)).toMatchObject({ data: { a: 1 }, style: { b: 2 }, source: null, dedupeKey: null, thumbnailAssetId: null })
    expect(repository.projects.list().map(p => p.title)).toEqual(['One edited', 'Two'])
  })
  it('keeps createdAt on update and finds by dedupe key', () => {
    const created = repository.projects.save(projectInput({ dedupeKey: 'k1', source: { x: 1 } }))!
    const updated = repository.projects.save({ ...projectInput(), id: created.id, dedupeKey: 'k1' })!
    expect(updated.createdAt).toBe(created.createdAt)
    expect(repository.projects.findByDedupe('k1')!.id).toBe(created.id)
    expect(repository.projects.findByDedupe('nope')).toBeNull()
  })
  it('writes a revision per save and keeps only the latest 30', () => {
    const created = repository.projects.save(projectInput())!
    for (let i = 0; i < 34; i++) repository.projects.save({ ...projectInput({ title: `v${i}` }), id: created.id })
    const count = useDatabase().prepare('SELECT count(*) c FROM revisions WHERE project_id = ?').get(created.id as string) as { c: number }
    expect(count.c).toBe(30)
  })
  it('duplicates with a new id and removes revisions with the project', () => {
    const created = repository.projects.save(projectInput({ title: 'Orig' }))!
    const copy = repository.projects.duplicate(created.id as string)!
    expect(copy.id).not.toBe(created.id)
    expect(copy.title).toBe('Orig (копия)')
    repository.projects.remove(copy.id as string)
    const left = useDatabase().prepare('SELECT count(*) c FROM revisions WHERE project_id = ?').get(copy.id as string) as { c: number }
    expect(left.c).toBe(0)
    expect(code(() => repository.projects.duplicate('missing'))).toBe(404)
  })
  it('rejects invalid input (422)', () => {
    expect(code(() => repository.projects.save(projectInput({ title: '' })))).toBe(422)
  })
})

describe('settings', () => {
  it('returns fallback, stores and overwrites JSON values', () => {
    expect(repository.settings.get('k', 'fb')).toBe('fb')
    repository.settings.set('k', { a: 1 })
    repository.settings.set('k', { a: 2 })
    expect(repository.settings.get('k')).toEqual({ a: 2 })
  })
})
