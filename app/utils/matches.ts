import type { ExternalMatch, Match, Team } from '~/types/dotaframe'

/* ---------- Time ---------- */

/** Offset of `timeZone` from UTC at the instant `at`, in ms (positive east of Greenwich). */
function zoneOffsetMs(timeZone: string, at: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(at))
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value)
  const wallAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return wallAsUtc - Math.floor(at / 1000) * 1000
}

/** The instant at which the clock in `timeZone` shows `date` + `time`; null for malformed input or an unknown zone. */
export function zonedWallTimeToDate(date: string, time: string, timeZone: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const clock = /^(\d{2}):(\d{2})$/.exec(time)
  if (!day || !clock) return null
  const wall = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(clock[1]), Number(clock[2]))
  try {
    const first = wall - zoneOffsetMs(timeZone, wall)
    // A second pass settles the offset when the first guess landed on the other side of a DST change.
    return new Date(wall - zoneOffsetMs(timeZone, first))
  } catch { return null }
}

export function matchStart(match: Pick<Match, 'startDate' | 'startTime' | 'timezone'>): Date | null {
  return zonedWallTimeToDate(match.startDate, match.startTime, match.timezone || 'UTC')
}

const startMs = (match: Match) => (matchStart(match) ?? new Date(`${match.startDate}T${match.startTime || '00:00'}:00Z`)).getTime()

const absoluteFormat = new Intl.DateTimeFormat('ru', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const relativeFormat = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' })

/** "сб, 14 нояб., 18:00" in the viewer's time zone, and "через 2 дн." relative to `now`. */
export function kickoffLabel(start: Date | null, now = new Date()) {
  if (!start || Number.isNaN(start.getTime())) return { absolute: 'Время не указано', relative: '' }
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000)
  const abs = Math.abs(minutes)
  const relative = abs < 1 ? 'сейчас'
    : abs < 60 ? relativeFormat.format(minutes, 'minute')
    : abs < 60 * 24 ? relativeFormat.format(Math.round(minutes / 60), 'hour')
      : relativeFormat.format(Math.round(minutes / (60 * 24)), 'day')
  return { absolute: absoluteFormat.format(start), relative }
}

/* ---------- Results of one team ---------- */

export type MatchResult = 'win' | 'loss' | 'draw'

export function teamOutcome(match: Match, teamId: string) {
  const isA = match.teamAId === teamId
  if (!isA && match.teamBId !== teamId) return null
  const own = isA ? match.scoreA : match.scoreB
  const other = isA ? match.scoreB : match.scoreA
  let result: MatchResult | null = null
  if (match.status === 'completed') {
    if (match.winnerTeamId) result = match.winnerTeamId === teamId ? 'win' : 'loss'
    else if (own !== null && other !== null) result = own > other ? 'win' : own < other ? 'loss' : 'draw'
  }
  return { opponentId: isA ? match.teamBId : match.teamAId, own, other, result }
}

/* ---------- Fixtures (what the overview lists) ---------- */

export interface FixtureView {
  key: string
  start: Date | null
  status: Match['status']
  opponentName: string
  /** Ready-to-use image URL, null when the opponent has no logo. */
  opponentLogo: string | null
  tournament: string
  stage: string
  format: string
  ownScore: number | null
  opponentScore: number | null
  result: MatchResult | null
  /** Set for matches stored in the studio. */
  localId: string | null
  hasPackage: boolean
  /** Set for PandaScore matches that are not imported yet. */
  externalMatch: ExternalMatch | null
  /** The favourite team's id on PandaScore, needed to link it when importing. */
  ownExternalId: string | null
}

const mediaUrl = (assetId: string | null | undefined) => assetId ? `/api/media/${assetId}` : null
export const pandaScoreLogoUrl = (url: string | null | undefined) => url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : null

export function localFixture(match: Match, teamId: string, teamsById: Map<string, Team>): FixtureView | null {
  const outcome = teamOutcome(match, teamId)
  if (!outcome) return null
  const opponent = teamsById.get(outcome.opponentId)
  const hasScore = match.status === 'live' || match.status === 'completed'
  return {
    key: `local:${match.id}`, start: matchStart(match), status: match.status,
    opponentName: opponent?.name ?? 'Команда удалена', opponentLogo: mediaUrl(opponent?.logoAssetId),
    tournament: match.tournament, stage: match.stage, format: match.format,
    ownScore: hasScore ? outcome.own : null, opponentScore: hasScore ? outcome.other : null, result: outcome.result,
    localId: match.id, hasPackage: !!match.source, externalMatch: null, ownExternalId: null
  }
}

export function externalFixture(match: ExternalMatch, side: 'A' | 'B'): FixtureView {
  const own = side === 'A' ? match.teamA : match.teamB
  const opponent = side === 'A' ? match.teamB : match.teamA
  const hasScore = match.status === 'live' || match.status === 'completed'
  const ownScore = hasScore ? (side === 'A' ? match.scoreA : match.scoreB) : null
  const opponentScore = hasScore ? (side === 'A' ? match.scoreB : match.scoreA) : null
  let result: MatchResult | null = null
  if (match.status === 'completed') {
    if (match.winnerExternalTeamId && own) result = match.winnerExternalTeamId === own.externalId ? 'win' : 'loss'
    else if (ownScore !== null && opponentScore !== null) result = ownScore > opponentScore ? 'win' : ownScore < opponentScore ? 'loss' : 'draw'
  }
  return {
    key: `external:${match.externalId}`, start: match.scheduledAt || match.beginAt ? new Date(match.scheduledAt || match.beginAt!) : null,
    status: match.status, opponentName: opponent?.name ?? 'Соперник уточняется', opponentLogo: pandaScoreLogoUrl(opponent?.logoUrl),
    tournament: match.tournament.leagueName || match.tournament.name, stage: match.tournament.leagueName ? match.tournament.name : '', format: match.format,
    ownScore, opponentScore,
    result, localId: null, hasPackage: false, externalMatch: match, ownExternalId: own?.externalId ?? null
  }
}

const normalizeName = (value: string) => value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, '')

/** Which side of a PandaScore match the team plays on: by its PandaScore link first, then by name. */
export function externalSide(match: ExternalMatch, team: Pick<Team, 'name' | 'externalRefs'>): 'A' | 'B' | null {
  const linked = team.externalRefs?.filter(ref => ref.provider === 'pandascore').map(ref => ref.externalId) ?? []
  const is = (candidate: ExternalMatch['teamA']) => !!candidate && (linked.includes(candidate.externalId) || normalizeName(candidate.name) === normalizeName(team.name))
  return is(match.teamA) ? 'A' : is(match.teamB) ? 'B' : null
}

/** Record over fixtures that have a result: matches, wins, losses, draws, win rate and maps won/lost. */
export function fixtureRecord(fixtures: FixtureView[]) {
  const record = { played: 0, wins: 0, losses: 0, draws: 0, mapsFor: 0, mapsAgainst: 0, winRate: null as number | null }
  for (const fixture of fixtures) {
    if (!fixture.result) continue
    record.played++
    if (fixture.result === 'win') record.wins++
    else if (fixture.result === 'loss') record.losses++
    else record.draws++
    record.mapsFor += fixture.ownScore ?? 0
    record.mapsAgainst += fixture.opponentScore ?? 0
  }
  record.winRate = record.played ? Math.round((record.wins / record.played) * 100) : null
  return record
}

/** The last `limit` results, oldest first, so the newest one is on the right of a form strip. */
export function fixtureForm(fixtures: FixtureView[], limit = 5): MatchResult[] {
  return fixtures
    .filter(fixture => fixture.result)
    .sort((a, b) => (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0))
    .slice(0, limit)
    .map(fixture => fixture.result!)
    .reverse()
}

/** Fixtures that are still to be played (live first, then by start time). */
export function sortUpcoming(fixtures: FixtureView[]) {
  return [...fixtures].sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity))
}

export const sortResults = (fixtures: FixtureView[]) => [...fixtures].sort((a, b) => (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0))
