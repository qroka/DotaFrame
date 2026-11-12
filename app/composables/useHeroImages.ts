import { api } from '~/services/api'
import type { HeroImage } from '~/types/dotaframe'

/** Extra hero pictures, shared between the Heroes page and the editor picker. Only metadata is loaded; images are served from /api/media. */
export function useHeroImages() {
  const images = useState<HeroImage[]>('hero-images', () => [])
  const loading = useState('hero-images-loading', () => false)
  const loaded = useState('hero-images-loaded', () => false)
  const byHero = computed(() => {
    const map = new Map<number, HeroImage[]>()
    for (const image of images.value) map.set(image.heroId, [...(map.get(image.heroId) ?? []), image])
    return map
  })
  async function refresh() {
    loading.value = true
    try {
      images.value = await api.heroImages.list()
      loaded.value = true
    } finally { loading.value = false }
  }
  /** Loads once; later calls reuse the cached list (call `refresh` to force). */
  const ensureLoaded = () => loaded.value ? Promise.resolve() : refresh()
  return { images: readonly(images), byHero, loading: readonly(loading), loaded: readonly(loaded), refresh, ensureLoaded }
}
