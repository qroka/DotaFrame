<!-- @level L0-Page -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Player } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { PLAYER_ROLE_ITEMS, countryLabel, playerRoleLabel } from '~/utils/players'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Игроки' })
const { players, teams, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const teamFilter = shallowRef('all')
const roleFilter = shallowRef('all')
const modalOpen = shallowRef(false)
const importOpen = shallowRef(false)
const selected = shallowRef<Player | null>(null)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<Player | null>(null)
const teamsById = computed(() => new Map(teams.value.map(team => [team.id, team])))
const teamFilterItems = computed(() => [
  { label: 'Все команды', value: 'all' }, { label: 'Без команды', value: 'none' },
  ...teams.value.filter(team => players.value.some(player => player.teamId === team.id)).map(team => ({ label: team.name, value: team.id }))
])
const roleFilterItems = [{ label: 'Все позиции', value: 'all' }, ...PLAYER_ROLE_ITEMS.slice(1)]
const columns: TableColumn<Player>[] = [
  { accessorKey: 'nickname', header: 'Игрок' }, { id: 'team', header: 'Команда' },
  { accessorKey: 'role', header: 'Позиция' }, { accessorKey: 'country', header: 'Страна' }, { id: 'actions' }
]
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('ru')
  return players.value
    .filter(player => teamFilter.value === 'all' || (teamFilter.value === 'none' ? !player.teamId : player.teamId === teamFilter.value))
    .filter(player => roleFilter.value === 'all' || player.role === roleFilter.value)
    .filter(player => !needle || `${player.nickname} ${player.realName} ${teamName(player)}`.toLocaleLowerCase('ru').includes(needle))
    // Within a team, list by position so a roster reads 1→5.
    .sort((a, b) => teamName(a).localeCompare(teamName(b), 'ru') || (a.role || '9').localeCompare(b.role || '9') || a.nickname.localeCompare(b.nickname, 'ru'))
})
function teamName(player: Player) { return player.teamId ? teamsById.value.get(player.teamId)?.name ?? '' : '' }
function teamLogo(player: Player) {
  const logo = player.teamId ? teamsById.value.get(player.teamId)?.logoAssetId : null
  return logo ? `/api/media/${logo}` : undefined
}
const hasPandaScore = (player: Player) => player.externalRefs?.some(ref => ref.provider === 'pandascore')
function createPlayer() { selected.value = null; modalOpen.value = true }
function editPlayer(player: Player) { selected.value = player; modalOpen.value = true }
function askDelete(player: Player) { pendingDelete.value = player; confirmOpen.value = true }
async function removePlayer() {
  if (!pendingDelete.value) return
  try {
    await api.players.remove(pendingDelete.value.id)
    toast.add({ title: 'Игрок удалён', color: 'success' })
    confirmOpen.value = false
    await refresh()
  } catch (cause) {
    toast.add({ title: 'Не удалось удалить игрока', description: apiError(cause), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Игроки" description="Составы команд: ники, позиции и фото">
        <template #actions>
          <UButton label="Загрузить из PandaScore" icon="i-lucide-cloud-download" color="neutral" variant="outline" @click="importOpen = true" />
          <UButton label="Добавить игрока" icon="i-lucide-plus" @click="createPlayer" />
        </template>
      </AppPageHeader>
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap items-center gap-2">
            <UInput v-model="query" icon="i-lucide-search" placeholder="Найти игрока…" class="w-full sm:w-64" />
            <USelectMenu v-model="teamFilter" :items="teamFilterItems" value-key="value" class="w-48" aria-label="Команда" />
            <USelect v-model="roleFilter" :items="roleFilterItems" class="w-44" aria-label="Позиция" />
          </div>
        </template>
        <template #right><span class="text-sm text-muted">{{ filtered.length }} игроков</span></template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-72 w-full" />
      <UCard v-else-if="filtered.length" class="shrink-0" :ui="{ body: 'p-0 sm:p-0' }">
        <UTable :data="filtered" :columns="columns">
          <template #nickname-cell="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar :src="row.original.photoAssetId ? `/api/media/${row.original.photoAssetId}` : undefined" :alt="row.original.nickname" icon="i-lucide-user" size="sm" class="bg-elevated" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 font-medium text-highlighted">
                  <span class="truncate">{{ row.original.nickname }}</span>
                  <UBadge v-if="hasPandaScore(row.original)" label="PandaScore" color="primary" variant="subtle" size="sm" />
                </div>
                <div v-if="row.original.realName" class="max-w-xs truncate text-xs text-muted">{{ row.original.realName }}</div>
              </div>
            </div>
          </template>
          <template #team-cell="{ row }">
            <div v-if="row.original.teamId" class="flex items-center gap-2">
              <UAvatar :src="teamLogo(row.original)" :alt="teamName(row.original)" icon="i-df-no-logo" size="2xs" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <span class="truncate">{{ teamName(row.original) }}</span>
            </div>
            <span v-else class="text-muted">—</span>
          </template>
          <template #role-cell="{ row }"><span class="whitespace-nowrap" :class="row.original.role ? '' : 'text-muted'">{{ playerRoleLabel(row.original.role) }}</span></template>
          <template #country-cell="{ row }"><span class="text-muted">{{ countryLabel(row.original.country) || '—' }}</span></template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="[[{ label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => editPlayer(row.original) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(row.original) }]]">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с игроком" />
              </UDropdownMenu>
            </div>
          </template>
        </UTable>
      </UCard>
      <EmptyState v-else icon="i-lucide-users" title="Игроки не найдены" :description="query || teamFilter !== 'all' || roleFilter !== 'all' ? 'Измените поиск или фильтры.' : 'Загрузите составы команд из PandaScore или добавьте игрока вручную.'" :action-label="query || teamFilter !== 'all' || roleFilter !== 'all' ? undefined : 'Загрузить из PandaScore'" @action="importOpen = true" />
    </template>
  </UDashboardPanel>
  <PlayersPlayerFormModal v-model:open="modalOpen" :player="selected" :default-team-id="teamFilter !== 'all' && teamFilter !== 'none' ? teamFilter : null" @saved="refresh" />
  <PandascorePandaScorePlayersModal v-model:open="importOpen" @imported="refresh" />
  <UModal v-model:open="confirmOpen" title="Удалить игрока?" :description="pendingDelete ? `Игрок «${pendingDelete.nickname}» будет удалён из справочника.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removePlayer" /></div></template>
  </UModal>
</template>
