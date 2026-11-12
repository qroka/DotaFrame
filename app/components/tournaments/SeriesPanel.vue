<!-- @level L2-Controller -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Tournament } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { TOURNAMENT_PHASE_META, type TournamentPhase, formatTournamentDates, tournamentPhase } from '~/utils/tournaments'

/** "Series" subsection: a season of a league (PandaScore series), stored in the `tournaments` table. */
const { tournaments, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const phase = shallowRef<'all' | TournamentPhase>('all')
const modalOpen = shallowRef(false)
const importOpen = shallowRef(false)
const selected = shallowRef<Tournament | null>(null)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<Tournament | null>(null)
const phaseItems = [
  { label: 'Все', value: 'all' }, { label: 'Идут', value: 'running' },
  { label: 'Скоро', value: 'upcoming' }, { label: 'Завершённые', value: 'past' }
]
const columns: TableColumn<Tournament>[] = [
  { accessorKey: 'name', header: 'Серия' }, { accessorKey: 'tier', header: 'Уровень' },
  { id: 'dates', header: 'Даты' }, { id: 'phase', header: 'Статус' }, { id: 'actions' }
]
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return tournaments.value.filter(item =>
    (phase.value === 'all' || tournamentPhase(item.startDate, item.endDate) === phase.value)
    && (!needle || `${item.name} ${item.league}`.toLocaleLowerCase('ru').includes(needle)))
})
const hasPandaScore = (item: Tournament) => item.externalRefs?.some(ref => ref.provider === 'pandascore')
function phaseMeta(item: Tournament) { return TOURNAMENT_PHASE_META[tournamentPhase(item.startDate, item.endDate)] }
function createTournament() { selected.value = null; modalOpen.value = true }
function editTournament(item: Tournament) { selected.value = item; modalOpen.value = true }
function askDelete(item: Tournament) { pendingDelete.value = item; confirmOpen.value = true }
async function removeTournament() {
  if (!pendingDelete.value) return
  try {
    await api.tournaments.remove(pendingDelete.value.id)
    toast.add({ title: 'Серия удалена', color: 'success' })
    confirmOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Не удалось удалить серию', description: apiError(cause), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Турниры" description="Лига → серия (сезон) → турнир (этап): справочник PandaScore, сроки и логотипы">
        <template #actions>
          <UButton label="Загрузить из PandaScore" icon="i-lucide-cloud-download" color="neutral" variant="outline" @click="importOpen = true" />
          <UButton label="Добавить серию" icon="i-lucide-plus" @click="createTournament" />
        </template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap items-center gap-2">
            <TournamentsHierarchyTabs active="series" />
            <UInput v-model="query" icon="i-lucide-search" placeholder="Найти серию…" class="w-full sm:w-64" />
            <USelect v-model="phase" :items="phaseItems" class="w-40" aria-label="Статус серии" />
          </div>
        </template>
        <template #right><span class="whitespace-nowrap text-sm text-muted">{{ filtered.length }} серий</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-72 w-full" />
      <UCard v-else-if="filtered.length" class="shrink-0" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :src="row.original.logoAssetId ? `/api/media/${row.original.logoAssetId}` : undefined" :alt="row.original.name" icon="i-lucide-trophy" size="sm" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 font-medium text-highlighted">
                  <span class="truncate">{{ row.original.name }}</span>
                  <UBadge v-if="hasPandaScore(row.original)" label="PandaScore" color="primary" variant="subtle" size="sm" />
                </div>
                <div v-if="row.original.league || row.original.notes" class="max-w-md truncate text-xs text-muted">{{ row.original.league || row.original.notes }}</div>
              </div>
            </div>
          </template>
          <template #tier-cell="{ row }"><UBadge :label="row.original.tier ? `Tier ${row.original.tier}` : '—'" color="neutral" variant="subtle" /></template>
          <template #dates-cell="{ row }"><span class="whitespace-nowrap text-muted">{{ formatTournamentDates(row.original.startDate, row.original.endDate) }}</span></template>
          <template #phase-cell="{ row }"><UBadge :label="phaseMeta(row.original).label" :color="phaseMeta(row.original).color" variant="subtle" /></template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="[[{ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => editTournament(row.original) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с серией" />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-layers" title="Серии не найдены" :description="query || phase !== 'all' ? 'Измените поиск или фильтр.' : 'Добавьте серию вручную или загрузите из PandaScore.'" :action-label="query || phase !== 'all' ? undefined : 'Загрузить из PandaScore'" @action="importOpen = true" />
    </template>
  </UDashboardPanel>
  <TournamentsTournamentFormModal v-model:open="modalOpen" :tournament="selected" @saved="refresh" />
  <PandascorePandaScoreTournamentsModal v-model:open="importOpen" @imported="refresh" />
  <UModal v-model:open="confirmOpen" title="Удалить серию?" :description="pendingDelete ? `Серия «${pendingDelete.name}» будет удалена из справочника. Матчи и лига не изменятся, её турниры останутся без серии.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removeTournament" /></div></template>
  </UModal>
</template>
