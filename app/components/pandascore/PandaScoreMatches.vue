<!-- @level L1-Feature -->
<script setup lang="ts">
import type { ExternalMatch } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const tabs = [
  { label: 'Ближайшие', value: 'upcoming', icon: 'i-lucide-calendar-clock' },
  { label: 'Сейчас идут', value: 'running', icon: 'i-lucide-radio' },
  { label: 'Завершённые', value: 'past', icon: 'i-lucide-history' }
]
const selected = shallowRef<'upcoming' | 'running' | 'past'>('upcoming')
const selectedTeamIds = shallowRef<string[]>([])
const revealed = shallowRef(false)
const importingId = shallowRef<string | null>(null)
const toast = useToast()
const { teams, matches: localMatches, refresh: refreshLocal } = useDotaFrameDb()
/** PandaScore match id → local match id for series that already have a publication package. */
const importedMatches = computed(() => new Map(localMatches.value.flatMap(match => match.source ? [[match.source.externalId, match.id] as const] : [])))
const { data, pending, error, refresh } = await useFetch('/api/integrations/pandascore/matches', {
  key: 'pandascore-matches', query: computed(() => ({ status: selected.value })), immediate: false, watch: false
})
const matches = computed(() => (data.value as { matches?: ExternalMatch[] } | null)?.matches ?? [])
const teamOptions = computed(() => teams.value.map(team => ({ label: team.name, value: team.id })))
const selectedTeams = computed(() => teams.value.filter(team => selectedTeamIds.value.includes(team.id)))
const normalizeName = (value: string) => value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, '')
function localTeamFor(externalTeam: ExternalMatch['teamA']) {
  if (!externalTeam) return null
  return selectedTeams.value.find(team => team.externalRefs?.some(ref => ref.provider === 'pandascore' && ref.externalId === externalTeam.externalId))
    || selectedTeams.value.find(team => normalizeName(team.name) === normalizeName(externalTeam.name))
    || null
}
const visibleMatches = computed(() => matches.value.filter(match => localTeamFor(match.teamA) || localTeamFor(match.teamB)))
const errorCode = computed(() => (error.value?.data as { data?: { code?: string } } | undefined)?.data?.code)
const errorText = computed(() => {
  if (errorCode.value === 'missing_token') return 'Добавьте PANDASCORE_TOKEN в серверное окружение и перезапустите Nuxt.'
  if (errorCode.value === 'rate_limited') return 'Лимит PandaScore исчерпан. Повторите загрузку позже.'
  return error.value ? apiError(error.value) : ''
})
const statusMeta: Record<ExternalMatch['status'], { label: string, color: 'neutral' | 'error' | 'success' | 'warning' }> = {
  scheduled: { label: 'Запланирован', color: 'neutral' }, live: { label: 'В эфире', color: 'error' },
  completed: { label: 'Завершён', color: 'success' }, cancelled: { label: 'Отменён', color: 'warning' }
}
function logoUrl(url: string | null | undefined) { return url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : '' }
function schedule(match: ExternalMatch) {
  const value = match.scheduledAt || match.beginAt || match.endAt
  return value ? new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Время не указано'
}
async function importMatch(match: ExternalMatch) {
  importingId.value = match.externalId
  try {
    const teamMappings = [match.teamA, match.teamB].flatMap(team => {
      const local = localTeamFor(team)
      return team && local ? [{ externalId: team.externalId, localId: local.id }] : []
    })
    const result = await api.integrations.pandascore.importMatch(match.externalId, teamMappings)
    await refreshLocal()
    await navigateTo(`/matches/${result.matchId}/package`)
  } catch (cause) { toast.add({ title: 'Не удалось создать пакет', description: apiError(cause), color: 'error' }) }
  finally { importingId.value = null }
}
async function showMatches() {
  if (!selectedTeamIds.value.length) return
  revealed.value = true
  await api.settings.set('pandascore.matchFilters', selectedTeamIds.value)
  await refresh()
}
watch(selected, () => { if (revealed.value) refresh() })
onMounted(async () => { selectedTeamIds.value = await api.settings.get<string[]>('pandascore.matchFilters', []).catch(() => []) })
</script>

<template>
  <section aria-labelledby="pandascore-heading">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 id="pandascore-heading" class="text-lg font-semibold text-highlighted">Матчи PandaScore</h2>
          <UBadge label="Live data" color="primary" variant="subtle" />
        </div>
        <p class="mt-1 text-sm text-muted">Импортируйте серию и подготовьте комплект публикаций</p>
      </div>
      <UButton v-if="revealed" label="Обновить" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="pending" @click="refresh()" />
    </div>
    <UCard v-if="!revealed" :ui="{ body: 'p-4 sm:p-5' }">
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <UFormField label="Команды" description="Выберите одну или несколько локальных команд — остальные матчи будут скрыты.">
          <USelectMenu v-model="selectedTeamIds" :items="teamOptions" value-key="value" multiple searchable class="w-full" placeholder="Выберите команды" />
        </UFormField>
        <UButton label="Показать матчи" icon="i-lucide-list-filter" :disabled="!selectedTeamIds.length" :loading="pending" @click="showMatches" />
      </div>
      <p v-if="!teamOptions.length" class="mt-3 text-sm text-warning">Сначала добавьте команду в локальный справочник.</p>
    </UCard>
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <UTabs v-model="selected" :items="tabs" class="min-w-0 flex-1" />
        <UButton label="Изменить команды" icon="i-lucide-users" color="neutral" variant="ghost" @click="revealed = false" />
      </div>
    <div v-if="pending" class="grid gap-3 lg:grid-cols-2">
      <USkeleton v-for="n in 4" :key="n" class="h-48" />
    </div>
    <UAlert v-else-if="error" color="error" variant="subtle" icon="i-lucide-cloud-off" title="PandaScore недоступен" :description="errorText">
      <template #actions><UButton label="Повторить" color="error" variant="outline" @click="refresh()" /></template>
    </UAlert>
    <div v-else-if="visibleMatches.length" class="grid gap-3 lg:grid-cols-2">
      <UCard v-for="match in visibleMatches" :key="match.externalId" class="overflow-hidden" :ui="{ body: 'p-4 sm:p-5' }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ match.tournament.leagueName || match.tournament.name }}</p><p class="mt-0.5 truncate text-xs text-muted">{{ match.tournament.name }}</p></div>
          <UBadge :label="statusMeta[match.status].label" :color="statusMeta[match.status].color" variant="subtle" />
        </div>
        <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div class="min-w-0 text-center">
            <div class="mx-auto grid size-14 place-items-center overflow-hidden rounded-lg border border-default bg-muted">
              <img v-if="match.teamA?.logoUrl" :src="logoUrl(match.teamA.logoUrl)" :alt="`Логотип ${match.teamA.name}`" class="size-11 object-contain" loading="lazy">
              <UIcon v-else name="i-lucide-shield" class="size-7 text-dimmed" />
            </div>
            <p class="mt-2 truncate text-sm font-semibold text-highlighted">{{ match.teamA?.name || 'TBD' }}</p>
          </div>
          <div class="text-center"><div class="df-display text-3xl font-bold tabular-nums text-highlighted">{{ match.scoreA }}:{{ match.scoreB }}</div><div class="mt-1 text-xs text-muted">{{ match.format }}</div></div>
          <div class="min-w-0 text-center">
            <div class="mx-auto grid size-14 place-items-center overflow-hidden rounded-lg border border-default bg-muted">
              <img v-if="match.teamB?.logoUrl" :src="logoUrl(match.teamB.logoUrl)" :alt="`Логотип ${match.teamB.name}`" class="size-11 object-contain" loading="lazy">
              <UIcon v-else name="i-lucide-shield" class="size-7 text-dimmed" />
            </div>
            <p class="mt-2 truncate text-sm font-semibold text-highlighted">{{ match.teamB?.name || 'TBD' }}</p>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
          <div class="text-xs text-muted"><div>{{ schedule(match) }}</div><div class="mt-1">Завершено карт: {{ match.games.filter(game => game.status === 'completed').length }}</div></div>
          <UButton v-if="importedMatches.has(match.externalId)" :to="`/matches/${importedMatches.get(match.externalId)}/package`" label="Открыть пакет" icon="i-lucide-package" color="neutral" variant="outline" />
          <UButton v-else label="Создать пакет" icon="i-lucide-package-plus" :loading="importingId === match.externalId" :disabled="!match.teamA || !match.teamB || importingId !== null" @click="importMatch(match)" />
        </div>
      </UCard>
    </div>
    <EmptyState v-else icon="i-lucide-calendar-x" title="Матчей выбранных команд нет" description="Измените команды или обновите список PandaScore." action-label="Изменить команды" @action="revealed = false" />
    </template>
  </section>
</template>
