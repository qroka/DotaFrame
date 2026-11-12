import type { ExternalMatch, ExternalTeamDetails, ExternalTournament, Match, PosterProject, PublicationPackage, Team, Tournament } from '~/types/dotaframe'

export interface BootstrapData { teams: Team[], tournaments: Tournament[], matches: Match[], projects: PosterProject[] }

export const api = {
  bootstrap: () => $fetch<BootstrapData>('/api/bootstrap'),
  teams: {
    get: (id: string) => $fetch<Team>(`/api/teams/${id}`),
    save: (value: Partial<Team>) => $fetch<Team>('/api/teams', { method: 'POST', body: value }),
    remove: (id: string) => $fetch(`/api/teams/${id}`, { method: 'DELETE' })
  },
  tournaments: {
    get: (id: string) => $fetch<Tournament>(`/api/tournaments/${id}`),
    save: (value: Partial<Tournament>) => $fetch<Tournament>('/api/tournaments', { method: 'POST', body: value }),
    remove: (id: string) => $fetch(`/api/tournaments/${id}`, { method: 'DELETE' })
  },
  matches: {
    get: (id: string) => $fetch<Match>(`/api/matches/${id}`),
    save: (value: Partial<Match>) => $fetch<Match>('/api/matches', { method: 'POST', body: value }),
    remove: (id: string) => $fetch(`/api/matches/${id}`, { method: 'DELETE' }),
    sync: (id: string) => $fetch<{ matchId: string, package: PublicationPackage }>(`/api/matches/${id}/sync`, { method: 'POST' }),
    getPackage: (id: string, trackedTeamId?: string | null) => $fetch<PublicationPackage>(`/api/matches/${id}/package`, { query: trackedTeamId ? { trackedTeamId } : undefined }),
    createPackage: (id: string, options: { trackedTeamId?: string | null, keys?: string[], forceNewVersion?: boolean } = {}) => $fetch<{ package: PublicationPackage, created: PosterProject[] }>(`/api/matches/${id}/package`, { method: 'POST', body: options })
  },
  drafts: {
    find: (matchId: string, mapNumber: number) => $fetch<Record<string, any> | null>('/api/drafts', { query: { matchId, mapNumber } }),
    save: (value: Record<string, any>) => $fetch<Record<string, any>>('/api/drafts', { method: 'POST', body: value })
  },
  projects: {
    get: (id: string) => $fetch<PosterProject>(`/api/projects/${id}`),
    save: (value: PosterProject, note = '') => $fetch<PosterProject>('/api/projects', { method: 'POST', body: { project: value, note } }),
    remove: (id: string) => $fetch(`/api/projects/${id}`, { method: 'DELETE' }),
    duplicate: (id: string) => $fetch<PosterProject>(`/api/projects/${id}/duplicate`, { method: 'POST' })
  },
  settings: {
    async get<T>(key: string, fallback: T): Promise<T> { const result = await $fetch<{ value: T | null }>(`/api/settings/${encodeURIComponent(key)}`); return result.value ?? fallback },
    set: <T>(key: string, value: T) => $fetch(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: { value } })
  },
  integrations: {
    pandascore: {
      getMatches: (status: 'upcoming' | 'running' | 'past') => $fetch<{ status: string, matches: ExternalMatch[] }>('/api/integrations/pandascore/matches', { query: { status } }),
      getTeams: (search = '') => $fetch<{ source: 'active' | 'search', teams: ExternalTeamDetails[] }>('/api/integrations/pandascore/teams', { query: search ? { search } : undefined }),
      importTeams: (externalIds: string[]) => $fetch<{ created: number, updated: number, imported: Array<{ externalId: string, localId: string, created: boolean }> }>('/api/integrations/pandascore/teams/import', { method: 'POST', body: { externalIds } }),
      getTournaments: (status: 'running' | 'upcoming' | 'past', search = '') => $fetch<{ status: string, search: string, tournaments: ExternalTournament[] }>('/api/integrations/pandascore/tournaments', { query: search ? { status, search } : { status } }),
      importTournaments: (externalIds: string[]) => $fetch<{ created: number, updated: number, imported: Array<{ externalId: string, localId: string, created: boolean }> }>('/api/integrations/pandascore/tournaments/import', { method: 'POST', body: { externalIds } }),
      importMatch: (externalMatchId: string, teamMappings: Array<{ externalId: string, localId: string }> = []) => $fetch<{ matchId: string, package: PublicationPackage }>('/api/integrations/pandascore/import', { method: 'POST', body: { externalMatchId, teamMappings } })
    }
  },
  async upload(file: File, kind: string) {
    const body = new FormData(); body.append('file', file); body.append('kind', kind)
    return $fetch<{ id: string, url: string }>('/api/media', { method: 'POST', body })
  }
}

export function apiError(cause: unknown) {
  const value = cause as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return value.data?.statusMessage || value.data?.message || value.statusMessage || value.message || String(cause)
}
