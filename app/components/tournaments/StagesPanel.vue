<!-- @level L2-Controller -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Stage } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { TOURNAMENT_PHASE_META, type TournamentPhase, formatTournamentDates, tournamentPhase } from '~/utils/tournaments'

/** "Tournament" subsection: one stage of a series (Group Stage, Playoffs), stored in the `stages` table. */
const { stages, tournaments, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const phase = shallowRef<'all' | TournamentPhase>('all')
const modalOpen = shallowRef(false)
const importOpen = shallowRef(false)
const selected = shallowRef<Stage | null>(null)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<Stage | null>(null)
const phaseItems = [
  { label: 'Все', value: 'all' }, { label: 'Идут', value: 'running' },
  { label: 'Скоро', value: 'upcoming' }, { label: 'Завершённые', value: 'past' }
]
const columns: TableColumn<Stage>[] = [
  { accessorKey: 'name', header: 'Турнир' }, { id: 'series', header: 'Серия' }, { accessorKey: 'tier', header: 'Уровень' },
  { id: 'dates', header: 'Даты' }, { accessorKey: 'prizePool', header: 'Призовой фонд' }, { id: 'phase', header: 'Статус' }, { id: 'actions' }
]
const seriesName = computed(() => new Map(tournaments.value.map(item => [item.id, item.name])))
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return stages.value.filter(item =>
    (phase.value === 'all' || tournamentPhase(item.startDate, item.endDate) === phase.value)
    && (!needle || `${item.name} ${item.seriesId ? seriesName.value.get(item.seriesId) ?? '' : ''}`.toLocaleLowerCase('ru').includes(needle)))
})
const hasPandaScore = (item: Stage) => item.externalRefs?.some(ref => ref.provider === 'pandascore')
function phaseMeta(item: Stage) { return TOURNAMENT_PHASE_META[tournamentPhase(item.startDate, item.endDate)] }
function createStage() { selected.value = null; modalOpen.value = true }
function editStage(item: Stage) { selected.value = item; modalOpen.value = true }
function askDelete(item: Stage) { pendingDelete.value = item; confirmOpen.value = true }
async function removeStage() {
  if (!pendingDelete.value) return
  try {
    await api.stages.remove(pendingDelete.value.id)
    toast.add({ title: 'Турнир удалён', color: 'success' })
    confirmOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Не удалось удалить турнир', description: apiError(cause), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Турниры" description="Лига → серия (сезон) → турнир (этап): справочник PandaScore, сроки и логотипы">
        <template #actions>
          <UButton label="Загрузить из PandaScore" icon="i-lucide-cloud-download" color="neutral" variant="outline" @click="importOpen = true" />
          <UButton label="Добавить турнир" icon="i-lucide-plus" @click="createStage" />
        </template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap items-center gap-2">
            <TournamentsHierarchyTabs active="tournament" />
            <UInput v-model="query" icon="i-lucide-search" placeholder="Найти турнир или серию…" class="w-full sm:w-64" />
            <USelect v-model="phase" :items="phaseItems" class="w-40" aria-label="Статус турнира" />
          </div>
        </template>
        <template #right><span class="whitespace-nowrap text-sm text-muted">{{ filtered.length }} турниров</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-72 w-full" />
      <UCard v-else-if="filtered.length" class="shrink-0" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #name-cell="{ row }">
            <div class="min-w-0">
              <div class="flex items-center gap-2 font-medium text-highlighted">
                <span class="truncate">{{ row.original.name }}</span>
                <UBadge v-if="hasPandaScore(row.original)" label="PandaScore" color="primary" variant="subtle" size="sm" />
              </div>
              <div v-if="row.original.notes" class="max-w-md truncate text-xs text-muted">{{ row.original.notes }}</div>
            </div>
          </template>
          <template #series-cell="{ row }"><span class="text-muted">{{ row.original.seriesId ? seriesName.get(row.original.seriesId) ?? '—' : '—' }}</span></template>
          <template #tier-cell="{ row }"><UBadge :label="row.original.tier ? `Tier ${row.original.tier}` : '—'" color="neutral" variant="subtle" /></template>
          <template #dates-cell="{ row }"><span class="whitespace-nowrap text-muted">{{ formatTournamentDates(row.original.startDate, row.original.endDate) }}</span></template>
          <template #prizePool-cell="{ row }"><span class="whitespace-nowrap text-muted">{{ row.original.prizePool || '—' }}</span></template>
          <template #phase-cell="{ row }"><UBadge :label="phaseMeta(row.original).label" :color="phaseMeta(row.original).color" variant="subtle" /></template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="[[{ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => editStage(row.original) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с турниром" />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-trophy" title="Турниры не найдены" :description="query || phase !== 'all' ? 'Измените поиск или фильтр.' : 'Добавьте турнир вручную или загрузите из PandaScore.'" :action-label="query || phase !== 'all' ? undefined : 'Загрузить из PandaScore'" @action="importOpen = true" />
    </template>
  </UDashboardPanel>
  <TournamentsStageFormModal v-model:open="modalOpen" :stage="selected" @saved="refresh" />
  <PandascorePandaScoreCatalogModal v-model:open="importOpen" kind="stage" @imported="refresh" />
  <UModal v-model:open="confirmOpen" title="Удалить турнир?" :description="pendingDelete ? `Турнир «${pendingDelete.name}» будет удалён из справочника. Серия и матчи не изменятся.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removeStage" /></div></template>
  </UModal>
</template>
