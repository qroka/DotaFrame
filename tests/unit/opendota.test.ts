import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearOpenDotaCache, findOpenDotaGame } from '../../server/utils/providers/opendota'
import { normalizePandaScoreMatch } from '../../server/utils/providers/pandascore'

const match = normalizePandaScoreMatch({
  id: 901, name: 'Alpha vs Beta', status: 'finished', scheduled_at: '2026-11-12T15:00:00Z', begin_at: '2026-11-12T15:00:00Z', end_at: '2026-11-12T15:40:00Z', number_of_games: 1,
  opponents: [{ opponent: { id: 10, name: 'Alpha' } }, { opponent: { id: 20, name: 'Beta' } }],
  results: [{ team_id: 10, score: 1 }, { team_id: 20, score: 0 }], winner_id: 10,
  tournament: { id: 30, name: 'Cup' }, league: { name: 'League' },
  games: [{ id: 501, position: 1, status: 'finished', winner_id: 10, begin_at: '2026-11-12T15:00:00Z', end_at: '2026-11-12T15:40:00Z' }]
})

const details = {
  match_id: 777, start_time: 1794495600, radiant_name: 'Beta', dire_name: 'Alpha', radiant_win: false,
  picks_bans: [
    ...[1, 2, 3, 4, 5].map((hero_id, order) => ({ is_pick: true, hero_id, team: 0, order })),
    ...[6, 7, 8, 9, 10].map((hero_id, index) => ({ is_pick: true, hero_id, team: 1, order: index + 5 }))
  ]
}

afterEach(() => { clearOpenDotaCache(); vi.restoreAllMocks() })

describe('OpenDota enrichment', () => {
  it('matches exact team names and time, then maps sides and draft', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => String(input).includes('/proMatches')
      ? new Response(JSON.stringify([{ match_id: 777, start_time: 1794495600, radiant_name: 'Beta', dire_name: 'Alpha' }]))
      : new Response(JSON.stringify(details))) as any
    const result = await findOpenDotaGame(match, match.games[0]!, { fetchImpl })
    expect(result).toMatchObject({ externalId: '777', radiantExternalTeamId: '20', direExternalTeamId: '10', winner: 'dire' })
    expect(result?.picksRadiant).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects ambiguous matches instead of inventing a draft', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      { match_id: 777, start_time: 1794495600, radiant_name: 'Alpha', dire_name: 'Beta' },
      { match_id: 778, start_time: 1794495660, radiant_name: 'Beta', dire_name: 'Alpha' }
    ]))) as any
    await expect(findOpenDotaGame(match, match.games[0]!, { fetchImpl })).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns null when there is no exact team pair', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => String(input).includes('/explorer')
      ? new Response(JSON.stringify({ rows: [] }))
      : new Response(JSON.stringify([{ match_id: 777, start_time: 1794495600, radiant_name: 'Other', dire_name: 'Beta' }]))) as any
    await expect(findOpenDotaGame(match, match.games[0]!, { fetchImpl })).resolves.toBeNull()
  })

  it('uses the read-only Explorer history when a match left proMatches', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/proMatches')) return new Response(JSON.stringify([]))
      if (url.includes('/explorer')) return new Response(JSON.stringify({ rows: [{ match_id: 777, start_time: 1794495600, radiant_name: 'Beta', dire_name: 'Alpha' }] }))
      return new Response(JSON.stringify(details))
    }) as any
    const result = await findOpenDotaGame(match, match.games[0]!, { fetchImpl })
    expect(result?.externalId).toBe('777')
    expect(decodeURIComponent(String(fetchImpl.mock.calls[1]?.[0]))).toContain('SELECT')
  })

  it('reports timeout', async () => {
    const fetchImpl = vi.fn((_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as any
    await expect(findOpenDotaGame(match, match.games[0]!, { fetchImpl, timeoutMs: 1 })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('retries publicly when a configured API key is rejected', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('api_key=')) return new Response('', { status: 401 })
      if (url.includes('/proMatches')) return new Response(JSON.stringify([{ match_id: 777, start_time: 1794495600, radiant_name: 'Beta', dire_name: 'Alpha' }]))
      return new Response(JSON.stringify(details))
    }) as any
    const result = await findOpenDotaGame(match, match.games[0]!, { apiKey: 'rejected-key', fetchImpl })
    expect(result?.externalId).toBe('777')
    expect(fetchImpl.mock.calls.some(call => !String(call[0]).includes('api_key='))).toBe(true)
  })
})
