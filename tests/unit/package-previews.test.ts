import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase } from '../../server/utils/database'
import { createPackageProjects, getPackagePreviews, importPandaScoreMatch } from '../../server/utils/pandascore-import'
import { normalizePandaScoreMatch } from '../../server/utils/providers/pandascore'
import { repository } from '../../server/utils/repository'
import { groupPackageItems, needsWork } from '../../app/utils/package'

let directory = ''
const logoFetch = vi.fn(async () => new Response(null, { status: 404 })) as any
const raw = (patch: Record<string, unknown> = {}) => ({
  id: 901, name: 'Alpha vs Beta', status: 'not_started', scheduled_at: '2026-11-12T15:00:00Z', begin_at: null, end_at: null, number_of_games: 3,
  opponents: [{ opponent: { id: 10, name: 'Alpha', acronym: 'ALP', image_url: null } }, { opponent: { id: 20, name: 'Beta', acronym: 'BET', image_url: null } }],
  results: [{ team_id: 10, score: 0 }, { team_id: 20, score: 0 }], winner_id: null,
  tournament: { id: 30, name: 'Playoffs' }, league: { id: 40, name: 'Dota League' },
  games: [{ id: 501, position: 1, status: 'not_started', winner_id: null, begin_at: null, end_at: null }], ...patch
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-previews-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

describe('publication package persistence and previews', () => {
  it('exposes the PandaScore source on imported matches so their package can be reopened', async () => {
    const imported = await importPandaScoreMatch(normalizePandaScoreMatch(raw()), { fetchImpl: logoFetch, enrichOpenDota: false })
    expect(repository.matches.get(imported.matchId)).toMatchObject({ source: { provider: 'pandascore', externalId: '901' } })
    expect(repository.matches.list().find(match => match.id === imported.matchId)?.source?.externalId).toBe('901')
    const manual = repository.matches.save({
      teamAId: String(repository.matches.get(imported.matchId)!.teamAId), teamBId: String(repository.matches.get(imported.matchId)!.teamBId),
      tournament: 'Cup', startDate: '2026-11-12', startTime: '18:00', timezone: 'UTC', format: 'BO3', status: 'scheduled'
    })!
    expect(manual.source).toBeNull()
  })

  it('previews ready items from match data and created items from their saved project', async () => {
    const imported = await importPandaScoreMatch(normalizePandaScoreMatch(raw()), { fetchImpl: logoFetch, enrichOpenDota: false })
    const before = getPackagePreviews(imported.matchId)
    const announcement = before.find(preview => preview.key.startsWith('announcement:'))
    expect(announcement).toMatchObject({ source: 'snapshot', templateId: 'match-announcement' })
    expect(announcement!.data).toBeTruthy()
    expect(announcement!.style).toBeTruthy()

    const { created } = createPackageProjects(imported.matchId)
    repository.projects.save({ ...created[0], data: { ...(created[0] as any).data, edited: true } }, 'правка')
    const after = getPackagePreviews(imported.matchId).find(preview => preview.key === announcement!.key)
    expect(after).toMatchObject({ source: 'project', templateId: 'match-announcement', data: { edited: true } })
  })

  it('groups posts by match phase and flags the ones that need work', () => {
    const item = (kind: string, mapNumber: number | null, status: string) => ({ key: `${kind}-${mapNumber}`, kind, mapNumber, status, title: '', templateId: '', gameId: null, externalGameId: null, reason: null, projectId: null }) as any
    const groups = groupPackageItems([item('announcement', null, 'ready'), item('draft', 1, 'requires_input'), item('map-result', 1, 'waiting_for_game'), item('series-result', null, 'waiting_for_series')])
    expect(groups.map(group => [group.title, group.items.length])).toEqual([['До матча', 1], ['Карта №1', 2], ['Итоги серии', 1]])
    expect(needsWork(item('draft', 1, 'requires_input'))).toBe(true)
    expect(needsWork(item('map-result', 1, 'waiting_for_game'))).toBe(false)
  })
})
