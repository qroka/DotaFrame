<!-- @level L2-Controller -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { League } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

/** "League" subsection: the permanent brand or organizer (DreamLeague, The International). */
const { leagues, tournaments, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const modalOpen = shallowRef(false)
const importOpen = shallowRef(false)
const selected = shallowRef<League | null>(null)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<League | null>(null)
const columns: TableColumn<League>[] = [{ accessorKey: 'name', header: 'Лига' }, { id: 'series', header: 'Серии' }, { id: 'actions' }]
const seriesCount = computed(() => {
  const counts = new Map<string, number>()
  for (const item of tournaments.value) if (item.leagueId) counts.set(item.leagueId, (counts.get(item.leagueId) ?? 0) + 1)
  return counts
})
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return leagues.value.filter(item => !needle || item.name.toLocaleLowerCase('ru').includes(needle))
})
const hasPandaScore = (item: League) => item.externalRefs?.some(ref => ref.provider === 'pandascore')
function createLeague() { selected.value = null; modalOpen.value = true }
function editLeague(item: League) { selected.value = item; modalOpen.value = true }
function askDelete(item: League) { pendingDelete.value = item; confirmOpen.value = true }
async function removeLeague() {
  if (!pendingDelete.value) return
  try {
    await api.leagues.remove(pendingDelete.value.id)
    toast.add({ title: 'Лига удалена', color: 'success' })
    confirmOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Не удалось удалить лигу', description: apiError(cause), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Турниры" description="Лига → серия (сезон) → турнир (этап): справочник PandaScore, сроки и логотипы">
        <template #actions>
          <UButton label="Загрузить из PandaScore" icon="i-lucide-cloud-download" color="neutral" variant="outline" @click="importOpen = true" />
          <UButton label="Добавить лигу" icon="i-lucide-plus" @click="createLeague" />
        </template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap items-center gap-2">
            <TournamentsHierarchyTabs active="league" />
            <UInput v-model="query" icon="i-lucide-search" placeholder="Найти лигу…" class="w-full sm:w-64" />
          </div>
        </template>
        <template #right><span class="whitespace-nowrap text-sm text-muted">{{ filtered.length }} лиг</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-72 w-full" />
      <UCard v-else-if="filtered.length" class="shrink-0" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :src="row.original.logoAssetId ? `/api/media/${row.original.logoAssetId}` : undefined" :alt="row.original.name" icon="i-lucide-flag" size="sm" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 font-medium text-highlighted">
                  <span class="truncate">{{ row.original.name }}</span>
                  <UBadge v-if="hasPandaScore(row.original)" label="PandaScore" color="primary" variant="subtle" size="sm" />
                </div>
                <div v-if="row.original.notes" class="max-w-md truncate text-xs text-muted">{{ row.original.notes }}</div>
              </div>
            </div>
          </template>
          <template #series-cell="{ row }"><UBadge :label="String(seriesCount.get(row.original.id) ?? 0)" color="neutral" variant="subtle" /></template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="[[{ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => editLeague(row.original) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с лигой" />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-flag" title="Лиги не найдены" :description="query ? 'Измените поиск.' : 'Добавьте лигу вручную или загрузите из PandaScore.'" :action-label="query ? undefined : 'Загрузить из PandaScore'" @action="importOpen = true" />
    </template>
  </UDashboardPanel>
  <TournamentsLeagueFormModal v-model:open="modalOpen" :league="selected" @saved="refresh" />
  <PandascorePandaScoreCatalogModal v-model:open="importOpen" kind="league" @imported="refresh" />
  <UModal v-model:open="confirmOpen" title="Удалить лигу?" :description="pendingDelete ? `Лига «${pendingDelete.name}» будет удалена из справочника. Лигу с сериями удалить нельзя.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removeLeague" /></div></template>
  </UModal>
</template>
