<!-- @level L0-Page -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Match } from '~/types/dotaframe'
import { api } from '~/services/api'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Матчи' })
const { matches, teams, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const status = shallowRef('all')
const deleteOpen = shallowRef(false)
const pendingDelete = shallowRef<Match | null>(null)
const teamNames = computed(() => Object.fromEntries(teams.value.map(team => [team.id, team.name])))
const columns: TableColumn<Match>[] = [
  { id: 'teams', header: 'Матч' }, { accessorKey: 'tournament', header: 'Турнир' },
  { id: 'schedule', header: 'Дата' }, { accessorKey: 'status', header: 'Статус' }, { id: 'actions' }
]
const statusOptions = [
  { label: 'Все статусы', value: 'all' }, { label: 'Запланированы', value: 'scheduled' },
  { label: 'Идут сейчас', value: 'live' }, { label: 'Завершены', value: 'completed' }, { label: 'Отменены', value: 'cancelled' }
]
const statusMeta: Record<string, { label: string, color: any }> = {
  scheduled: { label: 'Запланирован', color: 'neutral' }, live: { label: 'В эфире', color: 'error' },
  completed: { label: 'Завершён', color: 'success' }, cancelled: { label: 'Отменён', color: 'warning' }
}
const filtered = computed(() => matches.value.filter(match => {
  const text = `${teamNames.value[match.teamAId]} ${teamNames.value[match.teamBId]} ${match.tournament}`.toLocaleLowerCase('ru')
  return (!query.value || text.includes(query.value.toLocaleLowerCase('ru'))) && (status.value === 'all' || match.status === status.value)
}).sort((a, b) => `${b.startDate}T${b.startTime}`.localeCompare(`${a.startDate}T${a.startTime}`)))
function askDelete(match: Match) { pendingDelete.value = match; deleteOpen.value = true }
async function removeMatch() {
  if (!pendingDelete.value) return
  await api.matches.remove(pendingDelete.value.id)
  deleteOpen.value = false
  toast.add({ title: 'Матч удалён', color: 'success' })
  await refresh()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Матчи" description="Расписание, результаты и источники данных для публикаций">
        <template #actions><UButton to="/matches/new" label="Добавить матч" icon="i-lucide-plus" /></template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left><div class="flex w-full gap-2"><UInput v-model="query" icon="i-lucide-search" placeholder="Команда или турнир…" class="w-full sm:w-72" /><USelect v-model="status" value-key="value" :items="statusOptions" class="w-44" /></div></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-80 w-full" />
      <UCard v-else-if="filtered.length" class="shrink-0" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #teams-cell="{ row }"><div class="font-medium text-highlighted">{{ teamNames[row.original.teamAId] || 'Команда A' }} — {{ teamNames[row.original.teamBId] || 'Команда B' }}</div><div class="mt-0.5 text-xs text-muted">{{ row.original.format }}<template v-if="row.original.status === 'completed'"> · {{ row.original.scoreA }}:{{ row.original.scoreB }}</template></div></template>
          <template #tournament-cell="{ row }"><span>{{ row.original.tournament || '—' }}</span><div v-if="row.original.stage" class="text-xs text-muted">{{ row.original.stage }}</div></template>
          <template #schedule-cell="{ row }"><span class="tabular-nums">{{ row.original.startDate }}</span><div class="text-xs text-muted">{{ row.original.startTime }}</div></template>
          <template #status-cell="{ row }"><UBadge :label="statusMeta[row.original.status]?.label" :color="statusMeta[row.original.status]?.color" variant="subtle" /></template>
          <template #actions-cell="{ row }"><div class="flex justify-end"><UDropdownMenu :items="[[{ label: 'Открыть', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/matches/${row.original.id}`) }, { label: 'Создать публикацию', icon: 'i-lucide-image-plus', onSelect: () => navigateTo(`/templates?match=${row.original.id}`) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с матчем" /></UDropdownMenu></div></template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-swords" title="Матчи не найдены" :description="query || status !== 'all' ? 'Измените фильтры.' : 'Создайте первый матч для подготовки публикации.'" :action-label="query || status !== 'all' ? undefined : 'Добавить матч'" @action="navigateTo('/matches/new')" />
    </template>
  </UDashboardPanel>
  <UModal v-model:open="deleteOpen" title="Удалить матч?" description="Драфты матча будут удалены. Уже сохранённые публикации останутся доступны.">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" @click="removeMatch" /></div></template>
  </UModal>
</template>
