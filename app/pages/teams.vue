<!-- @level L0-Page -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Team } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Команды' })
const { teams, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const modalOpen = shallowRef(false)
const selected = shallowRef<Team | null>(null)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<Team | null>(null)
const columns: TableColumn<Team>[] = [
  { accessorKey: 'name', header: 'Команда' }, { accessorKey: 'shortName', header: 'Сокращение' },
  { accessorKey: 'region', header: 'Регион' }, { id: 'actions' }
]
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return needle ? teams.value.filter(team => `${team.name} ${team.shortName} ${team.region}`.toLocaleLowerCase('ru').includes(needle)) : [...teams.value]
})
function createTeam() { selected.value = null; modalOpen.value = true }
function editTeam(team: Team) { selected.value = team; modalOpen.value = true }
function askDelete(team: Team) { pendingDelete.value = team; confirmOpen.value = true }
async function removeTeam() {
  if (!pendingDelete.value) return
  try {
    await api.teams.remove(pendingDelete.value.id)
    toast.add({ title: 'Команда удалена', color: 'success' })
    confirmOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Не удалось удалить команду', description: apiError(cause), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Команды" description="Справочник логотипов и названий участников">
        <template #actions><UButton label="Добавить команду" icon="i-lucide-plus" @click="createTeam" /></template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left><UInput v-model="query" icon="i-lucide-search" placeholder="Найти команду…" class="w-full sm:w-72" /></template>
        <template #right><span class="text-sm text-muted">{{ filtered.length }} команд</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-72 w-full" />
      <UCard v-else-if="filtered.length" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #name-cell="{ row }"><div class="font-medium text-highlighted">{{ row.original.name }}</div><div v-if="row.original.notes" class="max-w-md truncate text-xs text-muted">{{ row.original.notes }}</div></template>
          <template #shortName-cell="{ row }"><UBadge :label="row.original.shortName || '—'" color="neutral" variant="subtle" /></template>
          <template #region-cell="{ row }"><span class="text-muted">{{ row.original.region || '—' }}</span></template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="[[{ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => editTeam(row.original) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с командой" />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-shield-plus" title="Команды не найдены" :description="query ? 'Измените поисковый запрос.' : 'Добавьте первую команду, чтобы создавать матчи.'" :action-label="query ? undefined : 'Добавить команду'" @action="createTeam" />
    </template>
  </UDashboardPanel>
  <TeamsTeamFormModal v-model:open="modalOpen" :team="selected" @saved="refresh" />
  <UModal v-model:open="confirmOpen" title="Удалить команду?" :description="pendingDelete ? `Команда «${pendingDelete.name}» будет удалена.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removeTeam" /></div></template>
  </UModal>
</template>
