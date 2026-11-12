import { describe, expect, it } from 'vitest'
import type { ExternalMatch, Match, Team } from '../../app/types/dotaframe'
import { externalFixture, externalSide, fixtureForm, fixtureRecord, kickoffLabel, localFixture, matchStart, sortUpcoming, teamOutcome, zonedWallTimeToDate } from '../../app/utils/matches'

const match = (patch: Partial<Match> = {}): Match => ({
  id: 'm1', teamAId: 'a', teamBId: 'b', tournament: 'Cup', stage: 'Group A', startDate: '2026-11-12', startTime: '18:00', timezone: 'UTC',
  format: 'BO3', status: 'scheduled', scoreA: null, scoreB: null, notes: '', ...patch
})
const done = (id: string, day: string, scoreA: number, scoreB: number, patch: Partial<Match> = {}) =>
  match({ id, startDate: day, status: 'completed', scoreA, scoreB, ...patch })

const fixturesOf = (matches: Match[]) => matches.map(item => localFixture(item, 'a', new Map())!)

describe('zonedWallTimeToDate', () => {
  it('converts a wall clock in a fixed-offset zone to the instant', () => {
    expect(zonedWallTimeToDate('2026-11-12', '18:00', 'Europe/Moscow')?.toISOString()).toBe('2026-11-12T15:00:00.000Z')
    expect(zonedWallTimeToDate('2026-11-12', '18:00', 'UTC')?.toISOString()).toBe('2026-11-12T18:00:00.000Z')
  })
  it('follows daylight saving time', () => {
    expect(zonedWallTimeToDate('2026-07-04', '12:00', 'America/New_York')?.toISOString()).toBe('2026-07-04T16:00:00.000Z')
    expect(zonedWallTimeToDate('2026-12-01', '12:00', 'America/New_York')?.toISOString()).toBe('2026-12-01T17:00:00.000Z')
    // Just after the spring-forward change in Europe/Berlin (2026-03-29): the clock is on summer time.
    expect(zonedWallTimeToDate('2026-03-29', '12:00', 'Europe/Berlin')?.toISOString()).toBe('2026-03-29T10:00:00.000Z')
  })
  it('rejects malformed input and unknown zones', () => {
    expect(zonedWallTimeToDate('2026-13', '18:00', 'UTC')).toBeNull()
    expect(zonedWallTimeToDate('2026-11-12', '6pm', 'UTC')).toBeNull()
    expect(zonedWallTimeToDate('2026-11-12', '18:00', 'Not/AZone')).toBeNull()
    expect(matchStart(match({ timezone: '' }))?.toISOString()).toBe('2026-11-12T18:00:00.000Z')
  })
})

describe('team results', () => {
  it('reads the outcome from the winner, or from the score when there is none', () => {
    expect(teamOutcome(done('x', '2026-11-01', 2, 1, { winnerTeamId: 'a' }), 'a')).toMatchObject({ result: 'win', own: 2, other: 1, opponentId: 'b' })
    expect(teamOutcome(done('x', '2026-11-01', 2, 1, { winnerTeamId: 'a' }), 'b')).toMatchObject({ result: 'loss', own: 1, other: 2, opponentId: 'a' })
    expect(teamOutcome(done('x', '2026-11-01', 0, 2), 'a')?.result).toBe('loss')
    expect(teamOutcome(done('x', '2026-11-01', 1, 1), 'a')?.result).toBe('draw')
    expect(teamOutcome(match({ status: 'live', scoreA: 1, scoreB: 0 }), 'a')?.result).toBeNull()
    expect(teamOutcome(match(), 'c')).toBeNull()
  })

  it('sums the record over completed matches only', () => {
    const matches = [done('1', '2026-11-01', 2, 0), done('2', '2026-11-02', 1, 2), done('3', '2026-11-03', 2, 1), match({ id: '4', status: 'scheduled' }), match({ id: '5', status: 'cancelled' })]
    expect(fixtureRecord(fixturesOf(matches))).toEqual({ played: 3, wins: 2, losses: 1, draws: 0, mapsFor: 5, mapsAgainst: 3, winRate: 67 })
    expect(fixtureRecord([])).toMatchObject({ played: 0, winRate: null })
  })

  it('lists the last results oldest first and skips unfinished matches', () => {
    const matches = [done('1', '2026-11-01', 2, 0), done('2', '2026-11-02', 0, 2), done('3', '2026-11-03', 2, 1), match({ id: '4', startDate: '2026-11-09' }), done('5', '2026-11-04', 2, 0), done('6', '2026-11-05', 1, 2), done('7', '2026-11-06', 2, 0)]
    // Newest five are 11-02 … 11-06, listed oldest first.
    expect(fixtureForm(fixturesOf(matches))).toEqual(['loss', 'win', 'win', 'loss', 'win'])
    expect(fixtureForm(fixturesOf(matches), 3)).toEqual(['win', 'loss', 'win'])
  })
})

describe('fixtures', () => {
  const teamsById = new Map<string, Team>([['b', { id: 'b', name: 'Beta', shortName: '', region: '', notes: '', logoAssetId: 'asset_b' }]])
  const external = (patch: Partial<ExternalMatch> = {}): ExternalMatch => ({
    provider: 'pandascore', externalId: '900', name: 'x', status: 'scheduled', scheduledAt: '2026-11-13T10:00:00Z', beginAt: null, endAt: null, format: 'BO3',
    tournament: { externalId: '1', name: 'Playoffs', leagueName: 'Dota League' },
    teamA: { externalId: '10', name: 'Alpha', shortName: 'ALP', logoUrl: null }, teamB: { externalId: '20', name: 'Beta', shortName: null, logoUrl: 'https://cdn.pandascore.co/b.png' },
    scoreA: 0, scoreB: 0, winnerExternalTeamId: null, games: [], ...patch
  })

  it('builds a local fixture from the favourite team side, with the opponent and package link', () => {
    const fixture = localFixture(done('m9', '2026-11-01', 0, 2, { source: { provider: 'pandascore', externalId: '1', syncedAt: 'x' } }), 'a', teamsById)!
    expect(fixture).toMatchObject({ opponentName: 'Beta', opponentLogo: '/api/media/asset_b', ownScore: 0, opponentScore: 2, result: 'loss', localId: 'm9', hasPackage: true })
    expect(localFixture(match(), 'zzz', teamsById)).toBeNull()
    expect(localFixture(match({ teamBId: 'gone' }), 'a', teamsById)!.opponentName).toBe('Команда удалена')
    // Scores of a match that has not started are hidden.
    expect(localFixture(match({ scoreA: 0, scoreB: 0 }), 'a', teamsById)).toMatchObject({ ownScore: null, opponentScore: null })
  })

  it('builds a PandaScore fixture seen from either side', () => {
    expect(externalFixture(external(), 'A')).toMatchObject({ opponentName: 'Beta', ownExternalId: '10', tournament: 'Dota League', stage: 'Playoffs', localId: null })
    const fromB = externalFixture(external({ status: 'live', scoreA: 1, scoreB: 0 }), 'B')
    expect(fromB).toMatchObject({ opponentName: 'Alpha', ownExternalId: '20', ownScore: 0, opponentScore: 1 })
    expect(fromB.opponentLogo).toBeNull()
    expect(externalFixture(external(), 'A').opponentLogo).toContain('/api/integrations/pandascore/logo?url=')
    expect(externalFixture(external({ teamB: null }), 'A').opponentName).toBe('Соперник уточняется')
  })

  it('reads the result of a finished PandaScore match from either side', () => {
    const finished = external({ status: 'completed', scoreA: 2, scoreB: 1, winnerExternalTeamId: '10' })
    expect(externalFixture(finished, 'A')).toMatchObject({ result: 'win', ownScore: 2, opponentScore: 1 })
    expect(externalFixture(finished, 'B')).toMatchObject({ result: 'loss', ownScore: 1, opponentScore: 2 })
    // Without a winner the score decides; a match that is not finished has no result.
    expect(externalFixture(external({ status: 'completed', scoreA: 0, scoreB: 2 }), 'A').result).toBe('loss')
    expect(externalFixture(external({ status: 'live', scoreA: 1, scoreB: 0 }), 'A').result).toBeNull()
    // Studio and PandaScore results count together in the record.
    const mixed = [...fixturesOf([done('1', '2026-11-01', 2, 0)]), externalFixture(finished, 'B')]
    expect(fixtureRecord(mixed)).toMatchObject({ played: 2, wins: 1, losses: 1, winRate: 50 })
  })

  it('finds the favourite team in a PandaScore match by link or by name', () => {
    expect(externalSide(external(), { name: 'Anything', externalRefs: [{ provider: 'pandascore', externalId: '20' }] })).toBe('B')
    expect(externalSide(external(), { name: 'ALPHA', externalRefs: [] })).toBe('A')
    expect(externalSide(external(), { name: 'Gamma', externalRefs: [] })).toBeNull()
  })

  it('puts live matches first, then orders by start time', () => {
    const base = localFixture(match(), 'a', teamsById)!
    const list = [{ ...base, key: 'late', start: new Date('2026-11-20T10:00:00Z') }, { ...base, key: 'live', status: 'live' as const, start: new Date('2026-11-12T08:00:00Z') }, { ...base, key: 'soon', start: new Date('2026-11-13T10:00:00Z') }, { ...base, key: 'tbd', start: null }]
    expect(sortUpcoming(list).map(item => item.key)).toEqual(['live', 'soon', 'late', 'tbd'])
  })
})

describe('kickoffLabel', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  it('says how far away the start is', () => {
    expect(kickoffLabel(new Date('2026-11-12T14:00:00Z'), now).relative).toMatch(/2 ч/)
    expect(kickoffLabel(new Date('2026-11-13T12:00:00Z'), now).relative).toBe('завтра')
    expect(kickoffLabel(new Date('2026-11-15T12:00:00Z'), now).relative).toMatch(/3 дн/)
    expect(kickoffLabel(new Date('2026-11-12T11:30:00Z'), now).relative).toMatch(/30 мин.*назад/)
    expect(kickoffLabel(new Date('2026-11-12T12:00:00Z'), now).relative).toBe('сейчас')
  })
  it('handles a missing start', () => {
    expect(kickoffLabel(null, now)).toEqual({ absolute: 'Время не указано', relative: '' })
  })
})
