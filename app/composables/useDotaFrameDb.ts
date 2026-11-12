import { onMounted, readonly } from 'vue'
import { api } from '~/services/api'
import type { Match, PosterProject, Player, Team, Tournament } from '~/types/dotaframe'

let bootPromise: Promise<void> | null = null

export function useDotaFrameDb() {
  const ready = useState('db-ready', () => false)
  const loading = useState('db-loading', () => false)
  const error = useState<string | null>('db-error', () => null)
  const teamsState = useState<Team[]>('db-teams', () => [])
  const tournamentsState = useState<Tournament[]>('db-tournaments', () => [])
  const playersState = useState<Player[]>('db-players', () => [])
  const matchesState = useState<Match[]>('db-matches', () => [])
  const projectsState = useState<PosterProject[]>('db-projects', () => [])
  async function refreshAll() {
    const data = await api.bootstrap()
    teamsState.value = data.teams; tournamentsState.value = data.tournaments ?? []; playersState.value = data.players ?? []; matchesState.value = data.matches; projectsState.value = data.projects
  }
  async function initialize() {
    if (ready.value) return
    if (bootPromise) return bootPromise
    loading.value = true
    bootPromise = refreshAll().then(() => { ready.value = true; error.value = null }).catch((cause) => { error.value = cause instanceof Error ? cause.message : String(cause); throw cause }).finally(() => { loading.value = false; bootPromise = null })
    return bootPromise
  }
  onMounted(() => initialize().catch(() => {}))
  return {
    ready: readonly(ready), loading: readonly(loading), error: readonly(error),
    teams: readonly(teamsState), tournaments: readonly(tournamentsState), players: readonly(playersState), matches: readonly(matchesState), projects: readonly(projectsState),
    initialize, refresh: refreshAll
  }
}
