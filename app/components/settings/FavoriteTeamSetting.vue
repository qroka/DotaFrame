<!-- @level L2-Controller -->
<script setup lang="ts">
import { apiError } from '~/services/api'

const NONE = 'none'
const toast = useToast()
const { teams } = useDotaFrameDb()
const { team: favoriteTeam, ensureLoaded, set } = useFavoriteTeam()
const saving = shallowRef(false)
onMounted(() => { ensureLoaded() })

const items = computed(() => [
  { label: 'Не выбрана', value: NONE, icon: 'i-lucide-star-off' },
  ...teams.value.map(team => ({
    label: team.name, value: team.id,
    ...(team.logoAssetId ? { avatar: { src: `/api/media/${team.logoAssetId}`, alt: team.name } } : { icon: 'i-df-no-logo' })
  }))
])
const model = computed({
  get: () => favoriteTeam.value?.id ?? NONE,
  set: (value: string) => { save(value === NONE ? null : value) }
})
async function save(id: string | null) {
  saving.value = true
  try {
    await set(id)
    toast.add({ title: id ? 'Избранная команда выбрана' : 'Избранная команда сброшена', description: id ? 'Её матчи, результаты и состав — на странице «Обзор».' : undefined, color: 'success', icon: 'i-lucide-check' })
  } catch (cause) { toast.add({ title: 'Не удалось сохранить выбор', description: apiError(cause), color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <UCard id="favorite-team">
    <template #header>
      <div>
        <h2 class="font-semibold text-highlighted">Избранная команда</h2>
        <p class="mt-1 text-sm text-muted">Её ближайшие матчи, результаты, состав и публикации собираются на странице «Обзор».</p>
      </div>
    </template>
    <div v-if="teams.length" class="flex flex-wrap items-center gap-3">
      <USelectMenu v-model="model" :items="items" value-key="value" :loading="saving" class="w-full sm:w-80" aria-label="Избранная команда" placeholder="Выберите команду" />
      <UButton v-if="favoriteTeam" to="/" label="Открыть обзор" icon="i-lucide-layout-dashboard" color="neutral" variant="outline" />
    </div>
    <p v-else class="text-sm text-muted">
      В справочнике пока нет команд. <NuxtLink to="/teams" class="text-primary hover:underline">Добавьте или загрузите их из PandaScore</NuxtLink>, затем выберите избранную.
    </p>
  </UCard>
</template>
