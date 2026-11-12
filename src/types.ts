/**
 * Types shared by the framework-agnostic poster code (src/domain, src/templates, src/render).
 * They describe the plain JSON that posters render from; app/ and server/ have their own,
 * wider record types and only need to be structurally compatible.
 */

export type Side = 'A' | 'B'
export type SeriesWinner = 'A' | 'B' | 'draw' | null
export type HeroAttr = 'str' | 'agi' | 'int' | 'all'
export type PosterTexts = Record<string, string>

/** Team as stored in the directory (only the fields posters need). */
export type TeamRecord = {
  id: string
  name: string
  shortName?: string | null
  logoAssetId?: string | null}

/** Match as edited in forms: scores may be empty strings, ids may be missing until chosen. */
export type MatchRecord = {
  id?: string | null
  teamAId?: string | null
  teamBId?: string | null
  tournament?: string | null
  stage?: string | null
  startDate?: string | null
  startTime?: string | null
  timezone?: string | null
  format: string
  status: string
  scoreA?: number | string | null
  scoreB?: number | string | null}

/** Working draft of one map (hero ids; null = empty pick slot). */
export type DraftRecord = {
  id?: string | null
  matchId?: string | null
  mapNumber: number
  radiantTeamId?: string | null
  direTeamId?: string | null
  picksRadiant?: Array<number | string | null>
  picksDire?: Array<number | string | null>
  bansRadiant?: Array<number | string | null>
  bansDire?: Array<number | string | null>
  winner?: 'radiant' | 'dire' | null}

export type Hero = {
  id: number
  slug: string
  name: string
  attr: HeroAttr
  aliases: string[]}

/* ---------- Snapshots: the JSON a saved poster renders from ---------- */

/** `logoAssetId` points at an immutable media version. */
export type TeamSnapshot = {
  teamId: string | null
  name: string
  shortName: string
  logoAssetId: string | null}

export type HeroSnapshot = {
  heroId: number | string
  name: string
  slug: string
  attr: string
  portraitAssetId: string | null}

export type MatchSnapshot = {
  matchId: string | null
  teamA: TeamSnapshot
  teamB: TeamSnapshot
  tournament: string
  stage: string
  startDate: string
  startTime: string
  timezone: string
  format: string
  status: string
  scoreA: number | null
  scoreB: number | null
  winner: SeriesWinner}

export type MatchPosterData = MatchSnapshot & {
  kind: 'match'
  perspective: Side
  texts: PosterTexts
  capturedAt?: string}

export type MatchesPosterData = {
  kind: 'matches'
  items: MatchSnapshot[]
  date: string
  texts: PosterTexts
  capturedAt?: string}

export type DraftPosterData = MatchSnapshot & {
  kind: 'draft'
  draftId?: string | null
  mapNumber: number
  radiant: TeamSnapshot
  dire: TeamSnapshot
  picksRadiant: Array<HeroSnapshot | null>
  picksDire: Array<HeroSnapshot | null>
  bansRadiant: HeroSnapshot[]
  bansDire: HeroSnapshot[]
  mapWinner: string | null
  perspective: Side
  texts: PosterTexts
  capturedAt?: string}

export type PosterData = MatchPosterData | MatchesPosterData | DraftPosterData
export type PosterSource = 'match' | 'matches' | 'draft'
