import { api } from '~/services/api'

const SETTING_KEY = 'favoriteTeamId'

/**
 * The favourite team, chosen in Settings and shown on the Overview. Stored on the server as a setting, so it
 * survives reloads and is part of backups. A team that was deleted simply resolves to "no favourite".
 */
export function useFavoriteTeam() {
  const { teams } = useDotaFrameDb()
  const favoriteId = useState<string | null>('favorite-team-id', () => null)
  const loaded = useState('favorite-team-loaded', () => false)
  const team = computed(() => favoriteId.value ? teams.value.find(item => item.id === favoriteId.value) ?? null : null)
  async function load() {
    favoriteId.value = await api.settings.get<string | null>(SETTING_KEY, null).catch(() => null)
    loaded.value = true
  }
  const ensureLoaded = () => loaded.value ? Promise.resolve() : load()
  async function set(id: string | null) {
    await api.settings.set(SETTING_KEY, id)
    favoriteId.value = id
  }
  return { favoriteId: readonly(favoriteId), team, loaded: readonly(loaded), load, ensureLoaded, set }
}
