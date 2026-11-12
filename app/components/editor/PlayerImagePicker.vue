<!-- @level L2-Controller -->
<script setup lang="ts">
import { HEROES_BY_ID, searchHeroes } from '~~/src/data/heroes'

/** Picks an already uploaded picture for the "Игрок / персонаж" layer: hero images from the Heroes section or player photos. */
const props = defineProps<{ current?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [assetId: string] }>()
const { images, loading, refresh } = useHeroImages()
const { players, teams } = useDotaFrameDb()
const tabs = [
  { label: 'Герои', value: 'heroes', icon: 'i-lucide-sword' },
  { label: 'Игроки', value: 'players', icon: 'i-lucide-users' }
]
const tab = shallowRef<'heroes' | 'players'>('heroes')
const query = shallowRef('')
const teamNames = computed(() => new Map(teams.value.map(team => [team.id, team.name])))

const heroItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  const matchingHeroes = needle ? new Set(searchHeroes(query.value).map(hero => hero.id)) : null
  return images.value
    .map(image => ({ image, hero: HEROES_BY_ID[image.heroId] }))
    .filter(item => item.hero && (!matchingHeroes || matchingHeroes.has(item.image.heroId) || item.image.title.toLocaleLowerCase('ru').includes(needle)))
})
const playerItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return players.value
    .filter(player => player.photoAssetId)
    .filter(player => !needle || `${player.nickname} ${player.realName} ${player.teamId ? teamNames.value.get(player.teamId) ?? '' : ''}`.toLocaleLowerCase('ru').includes(needle))
})

watch(open, isOpen => {
  if (!isOpen) return
  query.value = ''
  refresh().catch(() => {})
})
function choose(assetId: string) {
  emit('select', assetId)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" title="Изображение игрока / героя" description="Выберите уже загруженное изображение. Новые добавляются в разделе «Герои» или в карточке игрока." :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="space-y-3">
        <UTabs v-model="tab" :items="tabs" :content="false" size="sm" class="w-full" />
        <UInput v-model="query" icon="i-lucide-search" :placeholder="tab === 'heroes' ? 'Найти героя…' : 'Найти игрока или команду…'" class="w-full" />

        <template v-if="tab === 'heroes'">
          <div v-if="loading && !images.length" class="grid grid-cols-3 gap-3 sm:grid-cols-4"><USkeleton v-for="n in 8" :key="n" class="aspect-[4/5]" /></div>
          <div v-else-if="!heroItems.length" class="py-8 text-center">
            <p class="text-sm text-muted">{{ query ? 'Ничего не найдено.' : 'У героев пока нет своих изображений.' }}</p>
            <UButton to="/heroes" target="_blank" label="Открыть раздел «Герои»" icon="i-lucide-external-link" color="neutral" variant="outline" size="sm" class="mt-3" />
          </div>
          <ul v-else class="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4" data-testid="player-image-heroes">
            <li v-for="{ image, hero } in heroItems" :key="image.id">
              <button type="button" class="block w-full overflow-hidden rounded-lg text-left ring transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary" :class="current === image.assetId ? 'ring-2 ring-primary' : 'ring-default'" :aria-pressed="current === image.assetId" @click="choose(image.assetId)">
                <span class="df-checker grid aspect-[4/5] place-items-center"><img :src="`/api/media/${image.assetId}`" :alt="image.title || hero?.name" loading="lazy" decoding="async" class="max-h-full max-w-full object-contain"></span>
                <span class="block truncate px-2 pt-1.5 text-xs font-medium text-highlighted">{{ hero?.name }}</span>
                <span class="block truncate px-2 pb-1.5 text-xs text-muted">{{ image.title || 'Без названия' }}</span>
              </button>
            </li>
          </ul>
        </template>

        <template v-else>
          <p v-if="!playerItems.length" class="py-8 text-center text-sm text-muted">{{ query ? 'Ничего не найдено.' : 'Ни у одного игрока нет фото. Добавьте его в карточке игрока.' }}</p>
          <ul v-else class="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4" data-testid="player-image-players">
            <li v-for="player in playerItems" :key="player.id">
              <button type="button" class="block w-full overflow-hidden rounded-lg text-left ring transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary" :class="current === player.photoAssetId ? 'ring-2 ring-primary' : 'ring-default'" :aria-pressed="current === player.photoAssetId" @click="choose(player.photoAssetId!)">
                <span class="df-checker grid aspect-[4/5] place-items-center"><img :src="`/api/media/${player.photoAssetId}`" :alt="player.nickname" loading="lazy" decoding="async" class="max-h-full max-w-full object-contain"></span>
                <span class="block truncate px-2 pt-1.5 text-xs font-medium text-highlighted">{{ player.nickname }}</span>
                <span class="block truncate px-2 pb-1.5 text-xs text-muted">{{ (player.teamId && teamNames.get(player.teamId)) || 'Без команды' }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </UModal>
</template>
