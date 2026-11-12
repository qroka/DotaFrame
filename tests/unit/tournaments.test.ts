import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { findLocalTournamentForPandaScore, importPandaScoreTournaments } from '../../server/utils/pandascore-import'
import { fetchPandaScoreTournaments, normalizePandaScoreSerie, pandaScoreTournamentsImportSchema } from '../../server/utils/providers/pandascore'
import { repository } from '../../server/utils/repository'
import { formatTournamentDates, tournamentPhase } from '../../app/utils/tournaments'

let directory = ''
const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const logoFetch = vi.fn(async () => new Response(logo, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(logo.length) } })) as any
const code = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-tournaments-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
  logoFetch.mockClear()
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

describe('tournament repository', () => {
  it('saves, lists newest first and rejects duplicate names, reversed dates and unknown tiers', () => {
    const older = repository.tournaments.save({ name: 'Old Cup', startDate: '2026-01-10', endDate: '2026-01-20', tier: 'B' })!
    const newer = repository.tournaments.save({ name: 'New Cup', league: 'League', startDate: '2026-11-01', endDate: '' })!
    expect(newer).toMatchObject({ league: 'League', tier: '', startDate: '2026-11-01', endDate: null, externalRefs: [] })
    expect(repository.tournaments.list().map(item => item.id)).toEqual([newer.id, older.id])
    expect(code(() => repository.tournaments.save({ name: 'old cup' }))).toBe(409)
    expect(code(() => repository.tournaments.save({ name: 'Bad', startDate: '2026-02-02', endDate: '2026-02-01' }))).toBe(422)
    expect(code(() => repository.tournaments.save({ name: 'Bad tier', tier: 'X' }))).toBe(422)
  })

  it('updates in place and removes the tournament together with its PandaScore link', () => {
    const saved = repository.tournaments.save({ name: 'Cup' })!
    const updated = repository.tournaments.save({ ...saved, notes: 'финал в Москве' })!
    expect(updated.id).toBe(saved.id)
    expect(updated.createdAt).toBe(saved.createdAt)
    useDatabase().prepare("INSERT INTO external_entities(id,provider,entity_type,external_id,local_id,synced_at) VALUES('e1','pandascore','tournament','11165',?,'now')").run(String(saved.id))
    expect(repository.tournaments.get(String(saved.id))!.externalRefs).toEqual([{ provider: 'pandascore', externalId: '11165' }])
    repository.tournaments.remove(String(saved.id))
    expect(repository.tournaments.get(String(saved.id))).toBeNull()
    expect((useDatabase().prepare("SELECT count(*) count FROM external_entities WHERE entity_type = 'tournament'").get() as any).count).toBe(0)
  })
})

describe('PandaScore series normalization', () => {
  const serie = (patch: Record<string, unknown> = {}) => ({
    id: 11165, name: '', full_name: 'Season 2 2026', begin_at: '2026-11-03T13:00:00Z', end_at: '2026-11-20T23:00:00Z',
    league: { id: 5550, name: 'Asgard Championship ', image_url: 'https://cdn-api.pandascore.co/images/league/image/5550/a.png' },
    tournaments: [{ id: 1, name: 'Group A', tier: 'c' }, { id: 2, name: 'Playoffs', tier: 'b' }], ...patch
  })

  it('names a series after its league and season and takes the best stage tier', () => {
    expect(normalizePandaScoreSerie(serie())).toEqual({
      externalId: '11165', name: 'Asgard Championship Season 2 2026', league: 'Asgard Championship', tier: 'B',
      startDate: '2026-11-03', endDate: '2026-11-20', logoUrl: 'https://cdn-api.pandascore.co/images/league/image/5550/a.png'
    })
  })

  it('tolerates a missing league, invalid dates and unknown tiers', () => {
    expect(normalizePandaScoreSerie(serie({ league: null, full_name: null, name: null, begin_at: null, end_at: 'bad', tournaments: [{ tier: 'unranked' }] })))
      .toMatchObject({ name: 'PandaScore 11165', league: '', tier: '', startDate: null, endDate: null, logoUrl: null })
  })

  it('lists by status, or searches all series by slug, skipping malformed records', async () => {
    const fetchImpl = vi.fn(async (_url: unknown) => new Response(JSON.stringify([serie(), { id: 'broken', league: 5 }]), { status: 200 })) as any
    expect(await fetchPandaScoreTournaments('upcoming', '', { token: 't', fetchImpl })).toHaveLength(1)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/dota2/series/upcoming?')
    await fetchPandaScoreTournaments('past', ' The International 2026 ', { token: 't', fetchImpl })
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/dota2/series?per_page=50&search%5Bslug%5D=the-international-2026')
  })

  it('validates the import request', () => {
    expect(pandaScoreTournamentsImportSchema.safeParse({ externalIds: ['11165'] }).success).toBe(true)
    expect(pandaScoreTournamentsImportSchema.safeParse({ externalIds: [] }).success).toBe(false)
    expect(pandaScoreTournamentsImportSchema.safeParse({ externalIds: ['x'] }).success).toBe(false)
  })
})

describe('PandaScore tournament import', () => {
  const ti = { externalId: '10828', name: 'The International 2026', league: 'The International', tier: 'S' as const, startDate: '2026-08-14', endDate: '2026-09-15', logoUrl: 'https://cdn-api.pandascore.co/ti.png' }

  it('creates a tournament with logo once and refreshes dates on re-import without touching notes', async () => {
    const first = await importPandaScoreTournaments([ti], { fetchImpl: logoFetch })
    expect(first).toMatchObject({ created: 1, updated: 0 })
    const localId = first.imported[0]!.localId
    repository.tournaments.save({ ...repository.tournaments.get(localId), notes: 'наш комментарий' })
    const second = await importPandaScoreTournaments([{ ...ti, endDate: '2026-09-16' }], { fetchImpl: logoFetch })
    expect(second).toMatchObject({ created: 0, updated: 1 })
    expect(logoFetch).toHaveBeenCalledTimes(1)
    const saved = repository.tournaments.get(localId)!
    expect(saved).toMatchObject({ name: 'The International 2026', tier: 'S', endDate: '2026-09-16', notes: 'наш комментарий', externalRefs: [{ provider: 'pandascore', externalId: '10828' }] })
    expect(saved.logoAssetId).toBeTruthy()
  })

  it('links a manually created tournament with the same name instead of duplicating it', async () => {
    const manual = repository.tournaments.save({ name: 'the international 2026' })!
    const result = await importPandaScoreTournaments([ti], { fetchImpl: logoFetch })
    expect(result).toMatchObject({ created: 0, updated: 1 })
    expect(result.imported[0]!.localId).toBe(manual.id)
    expect(findLocalTournamentForPandaScore('10828', 'anything')).toBe(manual.id)
    expect(repository.tournaments.list()).toHaveLength(1)
  })
})

describe('tournament phase and dates', () => {
  it('derives the phase from dates, counting the last day as running', () => {
    expect(tournamentPhase('2026-11-01', '2026-11-12', '2026-11-12')).toBe('running')
    expect(tournamentPhase('2026-11-13', null, '2026-11-12')).toBe('upcoming')
    expect(tournamentPhase('2026-10-01', '2026-11-11', '2026-11-12')).toBe('past')
    expect(tournamentPhase(null, null, '2026-11-12')).toBe('unknown')
  })

  it('formats ranges and partial dates', () => {
    expect(formatTournamentDates('2026-11-03', '2026-11-20')).toContain(' — ')
    expect(formatTournamentDates('2026-11-03', null)).toMatch(/^с 3/)
    expect(formatTournamentDates(null, null)).toBe('Даты не указаны')
  })
})
