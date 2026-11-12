<!-- @level L0-Page -->
<script setup lang="ts">
import type { Hero, HeroAttr } from '~~/src/types'
import { ATTRIBUTES, searchHeroes } from '~~/src/data/heroes'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Герои' })
const { images, byHero, refresh } = useHeroImages()
const query = shallowRef('')
const attr = shallowRef<'all' | HeroAttr>('all')
const onlyWithImages = shallowRef(false)
const open = shallowRef(false)
const selectedId = shallowRef<number | null>(null)
const attrItems = [{ label: 'Все атрибуты', value: 'all' }, ...Object.values(ATTRIBUTES).map(item => ({ label: item.label, value: item.id }))]
const filtered = computed(() => searchHeroes(query.value, { attr: attr.value === 'all' ? '' : attr.value }).filter(hero => !onlyWithImages.value || byHero.value.has(hero.id)))
// Keep the opened hero in sync with the catalog by id, so the slideover never holds a stale object.
const selected = computed<Hero | null>(() => selectedId.value === null ? null : filtered.value.find(hero => hero.id === selectedId.value) ?? searchHeroes('').find(hero => hero.id === selectedId.value) ?? null)
const countOf = (hero: Hero) => byHero.value.get(hero.id)?.length ?? 0
function openHero(hero: Hero) { selectedId.value = hero.id; open.value = true }
onMounted(() => { refresh().catch(() => {}) })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Герои" description="Стандартные иконки и ваши изображения персонажей для публикаций" />
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap items-center gap-3">
            <UInput v-model="query" icon="i-lucide-search" placeholder="Найти героя…" class="w-full sm:w-64" />
            <USelect v-model="attr" :items="attrItems" class="w-48" aria-label="Атрибут" />
            <USwitch v-model="onlyWithImages" label="Только с моими изображениями" />
          </div>
        </template>
        <template #right><span class="text-sm text-muted">{{ filtered.length }} героев · {{ images.length }} изображений</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <div v-if="filtered.length" class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3" data-testid="hero-grid">
        <button
          v-for="hero in filtered"
          :key="hero.id"
          type="button"
          class="group relative overflow-hidden rounded-lg bg-default text-left ring ring-default transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary"
          :aria-label="`${hero.name}, изображений: ${countOf(hero)}`"
          :data-testid="`hero-card-${hero.slug}`"
          @click="openHero(hero)"
        >
          <div class="aspect-video overflow-hidden bg-elevated"><HeroesHeroPortrait :hero="hero" /></div>
          <div class="flex items-center gap-2 px-2.5 py-2">
            <span class="size-2 shrink-0 rounded-full" :style="{ background: ATTRIBUTES[hero.attr].color }" aria-hidden="true" />
            <span class="truncate text-sm font-medium text-highlighted">{{ hero.name }}</span>
          </div>
          <UBadge v-if="countOf(hero)" :label="String(countOf(hero))" icon="i-lucide-image" color="primary" variant="solid" size="sm" class="absolute right-2 top-2" />
        </button>
      </div>
      <EmptyState v-else icon="i-lucide-sword" title="Герои не найдены" :description="onlyWithImages && !query && attr === 'all' ? 'Ни у одного героя пока нет своих изображений. Откройте героя и добавьте первое.' : 'Измените поиск или фильтры.'" />
    </template>
  </UDashboardPanel>
  <HeroesHeroImagesSlideover v-model:open="open" :hero="selected" />
</template>
