import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { findLocalLeagueForPandaScore, findLocalStageForPandaScore, importPandaScoreLeagues, importPandaScoreStages } from '../../server/utils/pandascore-import'
import { fetchPandaScoreLeagues, fetchPandaScoreStages, normalizePandaScoreLeague, normalizePandaScoreStage, pandaScoreStagesImportSchema } from '../../server/utils/providers/pandascore'
import { repository } from '../../server/utils/repository'
import { parseHierarchyTab } from '../../app/utils/tournaments'

let directory = ''
const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const logoFetch = vi.fn(async () => new Response(logo, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(logo.length) } })) as any
const code = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }
const count = (sql: string) => (useDatabase().prepare(sql).get() as any).count as number

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-hierarchy-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
  logoFetch.mockClear()
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const rawStage = (patch: Record<string, unknown> = {}) => ({
  id: 9001, name: 'Playoffs', tier: 'a', begin_at: '2026-11-10T10:00:00Z', end_at: '2026-11-15T20:00:00Z', prizepool: '500000 United States Dollar',
  league: { id: 4001, name: 'DreamLeague', image_url: 'https://cdn-api.pandascore.co/league.png' },
  serie: { id: 7001, name: '', full_name: 'Season 30', begin_at: '2026-11-01T10:00:00Z', end_at: '2026-11-15T20:00:00Z' }, ...patch
})

describe('league repository', () => {
  it('creates, renames (keeping the series league name in step) and refuses to delete a league that has series', () => {
    const series = repository.tournaments.save({ name: 'DreamLeague Season 30', league: 'DreamLeague' })!
    expect(series.leagueId).toBeTruthy()
    const league = repository.leagues.get(String(series.leagueId))!
    expect(league).toMatchObject({ name: 'DreamLeague', externalRefs: [] })
    repository.leagues.save({ ...league, name: 'DreamLeague Pro' })
    expect(repository.tournaments.get(String(series.id))).toMatchObject({ league: 'DreamLeague Pro', leagueId: league.id })
    expect(code(() => repository.leagues.remove(String(league.id)))).toBe(409)
    repository.tournaments.remove(String(series.id))
    repository.leagues.remove(String(league.id))
    expect(repository.leagues.list()).toEqual([])
  })

  it('reuses a league by name, rejects duplicates and unknown league ids', () => {
    const first = repository.tournaments.save({ name: 'A', league: 'ESL One' })!
    const second = repository.tournaments.save({ name: 'B', league: 'esl one' })!
    expect(second.leagueId).toBe(first.leagueId)
    expect(repository.leagues.list()).toHaveLength(1)
    expect(code(() => repository.leagues.save({ name: 'ESL ONE' }))).toBe(409)
    expect(code(() => repository.leagues.save({ name: ' ' }))).toBe(422)
    expect(code(() => repository.tournaments.save({ name: 'C', leagueId: 'league_missing' }))).toBe(422)
    expect(repository.tournaments.save({ name: 'No league' })!.leagueId).toBeNull()
  })
})

describe('stage repository', () => {
  it('saves a stage under a series, validates dates, tier and series, and keeps it when the series is deleted', () => {
    const series = repository.tournaments.save({ name: 'DreamLeague Season 30', league: 'DreamLeague' })!
    const stage = repository.stages.save({ name: 'Group Stage', seriesId: series.id, tier: 'A', startDate: '2026-11-01', prizePool: '100000 USD' })!
    expect(stage).toMatchObject({ seriesId: series.id, tier: 'A', endDate: null, prizePool: '100000 USD', externalRefs: [] })
    expect(code(() => repository.stages.save({ name: 'Bad', startDate: '2026-02-02', endDate: '2026-02-01' }))).toBe(422)
    expect(code(() => repository.stages.save({ name: 'Bad tier', tier: 'X' }))).toBe(422)
    expect(code(() => repository.stages.save({ name: 'Orphan', seriesId: 'tournament_missing' }))).toBe(422)
    expect(repository.stages.save({ name: 'Free', seriesId: '' })!.seriesId).toBeNull()
    repository.tournaments.remove(String(series.id))
    expect(repository.stages.get(String(stage.id))!.seriesId).toBeNull()
    repository.stages.remove(String(stage.id))
    expect(repository.stages.get(String(stage.id))).toBeNull()
  })
})

describe('PandaScore leagues and tournaments', () => {
  it('normalizes a league and a tournament with its nested series and league', () => {
    expect(normalizePandaScoreLeague({ id: 4001, name: ' DreamLeague ', image_url: 'https://x/l.png' })).toEqual({ externalId: '4001', name: 'DreamLeague', logoUrl: 'https://x/l.png' })
    const stage = normalizePandaScoreStage(rawStage())
    expect(stage).toMatchObject({
      externalId: '9001', name: 'Playoffs', tier: 'A', startDate: '2026-11-10', endDate: '2026-11-15', prizePool: '500000 United States Dollar',
      league: { externalId: '4001', name: 'DreamLeague' }, serie: { externalId: '7001', name: 'DreamLeague Season 30', league: 'DreamLeague', tier: 'A' }
    })
    expect(normalizePandaScoreStage(rawStage({ league: null, serie: null, tier: 'unranked', prizepool: null }))).toMatchObject({ league: null, serie: null, tier: '', prizePool: '' })
  })

  it('lists leagues and tournaments from the matching PandaScore endpoints, skipping malformed records', async () => {
    const fetchImpl = vi.fn(async (url: unknown) => new Response(JSON.stringify(String(url).includes('/leagues') ? [{ id: 1, name: 'L' }, { id: 'x' }] : [rawStage(), { id: 'broken', serie: 5, league: 5, name: 7 }]), { status: 200 })) as any
    expect(await fetchPandaScoreLeagues('', { token: 't', fetchImpl })).toHaveLength(1)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/dota2/leagues?per_page=50&sort=-modified_at')
    await fetchPandaScoreLeagues(' Dream ', { token: 't', fetchImpl })
    expect(String(fetchImpl.mock.calls[1][0])).toContain('search%5Bname%5D=Dream')
    expect(await fetchPandaScoreStages('running', '', { token: 't', fetchImpl })).toHaveLength(1)
    expect(String(fetchImpl.mock.calls[2][0])).toContain('/dota2/tournaments/running?')
    await fetchPandaScoreStages('past', 'Playoffs', { token: 't', fetchImpl })
    expect(String(fetchImpl.mock.calls[3][0])).toContain('/dota2/tournaments?per_page=50&search%5Bname%5D=Playoffs')
    expect(pandaScoreStagesImportSchema.safeParse({ externalIds: [] }).success).toBe(false)
    expect(pandaScoreStagesImportSchema.safeParse({ externalIds: ['9001'] }).success).toBe(true)
  })

  it('imports leagues with a logo once, and links an unlinked local league of the same name', async () => {
    const manual = repository.leagues.save({ name: 'dreamleague', notes: 'наш комментарий' })!
    const dream = { externalId: '4001', name: 'DreamLeague', logoUrl: 'https://cdn-api.pandascore.co/league.png' }
    const first = await importPandaScoreLeagues([dream], { fetchImpl: logoFetch })
    expect(first).toMatchObject({ created: 0, updated: 1 })
    expect(first.imported[0]!.localId).toBe(manual.id)
    expect(findLocalLeagueForPandaScore('4001', 'whatever')).toBe(manual.id)
    await importPandaScoreLeagues([dream], { fetchImpl: logoFetch })
    expect(logoFetch).toHaveBeenCalledTimes(1)
    expect(repository.leagues.get(String(manual.id))).toMatchObject({ name: 'dreamleague', notes: 'наш комментарий', externalRefs: [{ provider: 'pandascore', externalId: '4001' }] })
    expect(repository.leagues.get(String(manual.id))!.logoAssetId).toBeTruthy()
  })

  it('imports a tournament together with its series and league, and re-importing updates in place', async () => {
    const first = await importPandaScoreStages([normalizePandaScoreStage(rawStage()), normalizePandaScoreStage(rawStage({ id: 9002, name: 'Group Stage' }))], { fetchImpl: logoFetch })
    expect(first).toMatchObject({ created: 2, updated: 0 })
    expect(count('SELECT count(*) count FROM leagues')).toBe(1)
    expect(count('SELECT count(*) count FROM tournaments')).toBe(1)
    expect(count('SELECT count(*) count FROM media')).toBe(1)
    const series = repository.tournaments.list()[0]!
    expect(series).toMatchObject({ name: 'DreamLeague Season 30', league: 'DreamLeague', externalRefs: [{ provider: 'pandascore', externalId: '7001' }] })
    expect(repository.leagues.get(String(series.leagueId))).toMatchObject({ name: 'DreamLeague', externalRefs: [{ provider: 'pandascore', externalId: '4001' }] })
    const stageId = findLocalStageForPandaScore('9001')!
    repository.stages.save({ ...repository.stages.get(stageId), notes: 'финал в Москве' })

    const second = await importPandaScoreStages([normalizePandaScoreStage(rawStage({ end_at: '2026-11-16T20:00:00Z', prizepool: '600000 United States Dollar' }))], { fetchImpl: logoFetch })
    expect(second).toMatchObject({ created: 0, updated: 1 })
    expect(count('SELECT count(*) count FROM stages')).toBe(2)
    expect(count('SELECT count(*) count FROM leagues')).toBe(1)
    expect(repository.stages.get(stageId)).toMatchObject({ seriesId: series.id, endDate: '2026-11-16', prizePool: '600000 United States Dollar', notes: 'финал в Москве', externalRefs: [{ provider: 'pandascore', externalId: '9001' }] })
    expect(logoFetch).toHaveBeenCalledTimes(1)
  })

  it('imports a tournament without a series as a standalone stage', async () => {
    const result = await importPandaScoreStages([normalizePandaScoreStage(rawStage({ serie: null, league: null }))], { fetchImpl: logoFetch })
    expect(result.imported[0]).toMatchObject({ seriesId: null, created: true })
    expect(count('SELECT count(*) count FROM tournaments')).toBe(0)
  })
})

describe('hierarchy tab', () => {
  it('defaults to series and ignores unknown values', () => {
    expect(parseHierarchyTab(undefined)).toBe('series')
    expect(parseHierarchyTab('league')).toBe('league')
    expect(parseHierarchyTab(['tournament', 'league'])).toBe('tournament')
    expect(parseHierarchyTab('nonsense')).toBe('series')
  })
})
