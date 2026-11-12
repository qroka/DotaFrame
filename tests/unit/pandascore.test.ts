import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PandaScoreError, clearPandaScoreCache, fetchPandaScoreMatches,
  fetchActivePandaScoreTeams, normalizeBestOf, normalizePandaScoreMatch, normalizePandaScoreStatus, pandaScoreTeamsImportSchema, searchPandaScoreTeams
} from '../../server/utils/providers/pandascore'

const rawMatch = (patch: Record<string, unknown> = {}) => ({
  id: 1791736, name: 'Alpha vs Beta', status: 'not_started', scheduled_at: '2026-11-12T15:00:00Z',
  begin_at: null, end_at: null, number_of_games: 3,
  opponents: [
    { opponent: { id: 10, name: 'Alpha', acronym: 'ALP', image_url: 'https://cdn.pandascore.co/alpha.png' } },
    { opponent: { id: 20, name: 'Beta', acronym: null, image_url: null } }
  ],
  results: [{ team_id: 10, score: 1 }, { team_id: 20, score: 0 }], winner_id: 10,
  tournament: { id: 30, name: 'Playoffs' }, league: { id: 40, name: 'Dota League' },
  games: [{ id: 50, position: 1, status: 'finished', winner_id: 10, begin_at: null, end_at: null }],
  ...patch
})

afterEach(() => { clearPandaScoreCache(); vi.restoreAllMocks() })

describe('PandaScore normalization', () => {
  it.each([['not_started', 'scheduled'], ['running', 'live'], ['finished', 'completed'], ['canceled', 'cancelled']])('maps %s to %s', (input, expected) => expect(normalizePandaScoreStatus(input)).toBe(expected))
  it.each([[1, 'BO1'], [2, 'BO2'], [3, 'BO3'], [5, 'BO5'], [null, 'BO3']])('maps game count %s to %s', (input, expected) => expect(normalizeBestOf(input)).toBe(expected))
  it('normalizes teams, score and completed game winner', () => {
    const match = normalizePandaScoreMatch(rawMatch({ status: 'finished' }))
    expect(match).toMatchObject({ externalId: '1791736', scoreA: 1, scoreB: 0, winnerExternalTeamId: '10', format: 'BO3' })
    expect(match.teamA).toMatchObject({ externalId: '10', shortName: 'ALP' })
    expect(match.games[0]).toMatchObject({ status: 'completed', winnerExternalTeamId: '10' })
  })
  it('accepts an unplayed game whose winner object has a null id', () => {
    const match = normalizePandaScoreMatch(rawMatch({ status: 'not_started', winner_id: null, games: [{ id: 50, position: 1, status: 'not_started', winner_id: null, winner: { id: null, type: 'Team' }, begin_at: null, end_at: null }] }))
    expect(match.status).toBe('scheduled')
    expect(match.games[0]).toMatchObject({ status: 'scheduled', winnerExternalTeamId: null })
  })

  it('ignores winner_id for a canceled match and game', () => {
    const match = normalizePandaScoreMatch(rawMatch({ status: 'canceled', games: [{ id: 50, position: 1, status: 'canceled', winner_id: 10 }] }))
    expect(match.winnerExternalTeamId).toBeNull()
    expect(match.games[0]?.winnerExternalTeamId).toBeNull()
  })
  it('keeps a match with one absent team and without a logo', () => {
    const match = normalizePandaScoreMatch(rawMatch({ opponents: [{ opponent: { id: 10, name: 'Alpha', acronym: null, image_url: null } }] }))
    expect(match.teamA?.logoUrl).toBeNull()
    expect(match.teamB).toBeNull()
  })
})

describe('PandaScore fetch adapter', () => {
  it('returns a normalized successful response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([rawMatch()]), { status: 200, headers: { 'content-type': 'application/json' } })) as any
    const result = await fetchPandaScoreMatches('upcoming', { token: 'secret', fetchImpl })
    expect(result).toHaveLength(1)
    expect(fetchImpl.mock.calls[0]?.[1]?.headers.Authorization).toBe('Bearer secret')
  })
  it.each([[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited']])('maps HTTP %s', async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response('', { status })) as any
    await expect(fetchPandaScoreMatches('upcoming', { token: 'secret', fetchImpl })).rejects.toMatchObject({ code })
  })
  it('handles malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('{', { status: 200 })) as any
    await expect(fetchPandaScoreMatches('upcoming', { token: 'secret', fetchImpl })).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('handles timeout', async () => {
    const fetchImpl = vi.fn((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as any
    await expect(fetchPandaScoreMatches('upcoming', { token: 'secret', fetchImpl, timeoutMs: 1 })).rejects.toMatchObject({ code: 'timeout' })
  })
  it('rejects a missing token before fetch', async () => {
    await expect(fetchPandaScoreMatches('upcoming', { token: '' })).rejects.toBeInstanceOf(PandaScoreError)
  })
})

describe('PandaScore teams', () => {
  const okList = (body: unknown[]) => vi.fn(async (_url: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as any

  it('normalizes a catalogue team with region and skips malformed ones', async () => {
    const fetchImpl = okList([{ id: 1647, name: ' Team Liquid ', acronym: 'Liquid', location: 'NL', image_url: 'https://cdn-api.pandascore.co/l.png' }, { id: 2, name: '' }])
    const teams = await searchPandaScoreTeams('liquid', { token: 't', fetchImpl })
    expect(teams).toEqual([{ externalId: '1647', name: 'Team Liquid', shortName: 'Liquid', logoUrl: 'https://cdn-api.pandascore.co/l.png', location: 'NL' }])
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/dota2/teams?search%5Bname%5D=liquid')
  })

  it('collects unique teams from live and upcoming matches and enriches their region', async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url)
      const body = path.includes('/teams') ? [{ id: 10, name: 'Alpha', acronym: 'ALP', location: 'SE', image_url: null }]
        : path.includes('/upcoming') ? [rawMatch({ id: 1 }), rawMatch({ id: 2 })] : []
      return new Response(JSON.stringify(body), { status: 200 })
    }) as any
    const teams = await fetchActivePandaScoreTeams({ token: 't', fetchImpl })
    expect(teams.map(team => [team.externalId, team.location])).toEqual([['10', 'SE'], ['20', null]])
  })

  it('validates the import request size', () => {
    expect(pandaScoreTeamsImportSchema.safeParse({ externalIds: [] }).success).toBe(false)
    expect(pandaScoreTeamsImportSchema.safeParse({ externalIds: ['1647'] }).success).toBe(true)
    expect(pandaScoreTeamsImportSchema.safeParse({ externalIds: ['x'] }).success).toBe(false)
  })
})
