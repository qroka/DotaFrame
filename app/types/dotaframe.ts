export interface Team {
  id: string; name: string; shortName: string; region: string; notes: string
  logoAssetId: string | null; createdAt?: string; updatedAt?: string
  externalRefs?: ReadonlyArray<{ provider: 'pandascore', externalId: string }>
}
export interface Match {
  id: string; teamAId: string; teamBId: string; tournament: string; stage: string
  startDate: string; startTime: string; timezone: string; format: string
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  scoreA: number | null; scoreB: number | null; notes: string
  winnerTeamId?: string | null
  createdAt?: string; updatedAt?: string
  source?: { provider: 'pandascore', externalId: string, syncedAt: string }
}
export interface PosterProject {
  id: string | null; title: string; templateId: string; templateVersion: number
  matchId: string | null; data: Record<string, any>; style: Record<string, any>
  size: string; createdAt: string | null; updatedAt?: string; savedAt?: string
  thumbnailAssetId: string | null
  dedupeKey?: string | null; source?: Record<string, any> | null
}

export type ExternalMatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'
export interface ExternalTeam { externalId: string; name: string; shortName: string | null; logoUrl: string | null }
export interface ExternalGame {
  externalId: string; mapNumber: number; status: ExternalMatchStatus
  winnerExternalTeamId: string | null; beginAt: string | null; endAt: string | null
}
export interface ExternalMatch {
  provider: 'pandascore'; externalId: string; name: string; status: ExternalMatchStatus
  scheduledAt: string | null; beginAt: string | null; endAt: string | null; format: 'BO1' | 'BO2' | 'BO3' | 'BO5'
  tournament: { externalId: string, name: string, leagueName: string }
  teamA: ExternalTeam | null; teamB: ExternalTeam | null; scoreA: number; scoreB: number
  winnerExternalTeamId: string | null; games: ExternalGame[]
}
export interface MatchGame {
  id: string; matchId: string; provider: 'pandascore'; externalId: string; mapNumber: number
  status: ExternalMatchStatus; winnerTeamId: string | null; beginAt: string | null; endAt: string | null
  statsProvider: string | null; statsExternalId: string | null; stats: Record<string, unknown> | null
  createdAt: string; updatedAt: string
}
export type PackageItemStatus = 'ready' | 'requires_input' | 'waiting_for_game' | 'waiting_for_series' | 'unavailable' | 'created'
export interface PublicationPackageItem {
  key: string; kind: 'announcement' | 'draft' | 'map-result' | 'series-result' | 'team-outcome'
  title: string; templateId: string; mapNumber: number | null; gameId: string | null; externalGameId: string | null
  status: PackageItemStatus; reason: string | null; projectId: string | null
}
export interface PublicationPackage {
  match: Match; teams: Team[]; games: MatchGame[]; trackedTeamId: string | null
  source: { provider: 'pandascore', externalId: string, syncedAt: string }
  items: PublicationPackageItem[]
}
export interface PosterTemplate {
  id: string; type: string; version: number; name: string; description: string
  source: 'match' | 'matches' | 'draft'; base: { width: number, height: number }
  exportSizes: Array<{ id: string, label: string, width: number, height: number }>
  texts: Array<{ key: string, label: string, default?: string, maxLength?: number }>
  settings: Array<Record<string, any>>; render: (context: any) => HTMLElement
  validate: (data: any, style: any) => Array<{ level: 'error' | 'warning', message: string }>
}
