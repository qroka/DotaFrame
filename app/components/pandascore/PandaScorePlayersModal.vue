<!-- @level L2-Controller -->
<script setup lang="ts">
import type { ExternalPlayer } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { countryLabel, playerRoleLabel } from '~/utils/players'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const BATCH = 100
const toast = useToast()
const search = shallowRef('')
const players = shallowRef<ExternalPlayer[]>([])
const source = shallowRef<'rosters' | 'search'>('rosters')
const linkedTeams = shallowRef(0)
const loading = shallowRef(false)
const importing = shallowRef(false)
const errorText = shallowRef('')
const selected = ref(new Set<string>())
let requestId = 0
let debounce: ReturnType<typeof setTimeout> | undefined

const newPlayers = computed(() => players.value.filter(player => !player.localPlayerId))
const allNewSelected = computed(() => newPlayers.value.length > 0 && newPlayers.value.every(player => selected.value.has(player.externalId)))
/** Roster view groups players by team, keeping PandaScore's order inside each team. */
const groups = computed(() => {
  if (source.value === 'search') return [{ key: 'all', title: '', players: players.value }]
  const byTeam = new Map<string, { key: string, title: string, players: ExternalPlayer[] }>()
  for (const player of players.value) {
    const key = player.team?.externalId ?? 'none'
    if (!byTeam.has(key)) byTeam.set(key, { key, title: player.team?.name ?? 'Без команды', players: [] })
    byTeam.get(key)!.players.push(player)
  }
  return [...byTeam.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'))
})
const summary = computed(() => source.value === 'search'
  ? `Найдено: ${players.value.length}`
  : `Составы ${linkedTeams.value} команд из справочника: ${players.value.length} игроков`)

async function load() {
  const current = ++requestId
  loading.value = true
  errorText.value = ''
  try {
    const result = await api.integrations.pandascore.getPlayers(search.value.trim())
    if (current !== requestId) return
    players.value = result.players
    source.value = result.source
    linkedTeams.value = result.linkedTeams
  } catch (cause) {
    if (current !== requestId) return
    players.value = []
    errorText.value = apiError(cause)
  } finally { if (current === requestId) loading.value = false }
}

watch(search, () => { clearTimeout(debounce); debounce = setTimeout(load, 350) })
watch(open, isOpen => {
  if (!isOpen) return
  selected.value = new Set()
  search.value = ''
  load()
}, { immediate: true })

function toggle(player: ExternalPlayer, value: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (value === true) next.add(player.externalId)
  else next.delete(player.externalId)
  selected.value = next
}
function toggleAllNew() { selected.value = allNewSelected.value ? new Set() : new Set(newPlayers.value.map(player => player.externalId)) }
function photoUrl(url: string | null) { return url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : undefined }

async function importSelected() {
  const ids = [...selected.value]
  if (!ids.length) return
  importing.value = true
  const totals = { created: 0, updated: 0, withoutTeam: 0 }
  try {
    for (let start = 0; start < ids.length; start += BATCH) {
      const result = await api.integrations.pandascore.importPlayers(ids.slice(start, start + BATCH))
      totals.created += result.created; totals.updated += result.updated; totals.withoutTeam += result.withoutTeam
    }
    const parts = [totals.created && `добавлено ${totals.created}`, totals.updated && `обновлено ${totals.updated}`, totals.withoutTeam && `без команды из справочника: ${totals.withoutTeam}`].filter(Boolean)
    toast.add({ title: 'Игроки загружены из PandaScore', description: parts.join(', '), color: 'success', icon: 'i-lucide-check' })
    emit('imported')
    open.value = false
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить игроков', description: apiError(cause), color: 'error' })
    if (totals.created || totals.updated) emit('imported')
  } finally { importing.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Загрузить игроков из PandaScore" description="Ник, имя, позиция, страна и фото подтянутся автоматически. Игрок привязывается к команде из справочника; повторная загрузка учтёт трансферы." :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Найти игрока по нику…" class="w-full" :loading="loading" />
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-muted">{{ summary }}</span>
          <UButton v-if="newPlayers.length" :label="allNewSelected ? 'Снять выбор' : 'Выбрать всех новых'" color="neutral" variant="link" size="sm" @click="toggleAllNew" />
        </div>
        <UAlert v-if="errorText" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorText" />
        <div v-else-if="loading && !players.length" class="space-y-2"><USkeleton v-for="n in 6" :key="n" class="h-12 w-full" /></div>
        <p v-else-if="!players.length" class="py-8 text-center text-sm text-muted">
          {{ search ? 'Ничего не найдено. Проверьте ник.' : linkedTeams ? 'У команд из справочника нет активных игроков в PandaScore.' : 'Сначала загрузите команды из PandaScore — здесь появятся их составы. Или найдите игрока по нику.' }}
        </p>
        <div v-else class="max-h-[50vh] overflow-y-auto rounded-lg ring ring-default" data-testid="pandascore-player-list">
          <section v-for="group in groups" :key="group.key">
            <h3 v-if="group.title" class="sticky top-0 z-10 bg-elevated px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{{ group.title }}</h3>
            <ul class="divide-y divide-default">
              <li v-for="player in group.players" :key="player.externalId">
                <label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-elevated/50">
                  <UCheckbox :model-value="selected.has(player.externalId)" :aria-label="`Выбрать ${player.nickname}`" @update:model-value="toggle(player, $event)" />
                  <UAvatar :src="photoUrl(player.photoUrl)" :alt="player.nickname" icon="i-lucide-user" size="md" class="bg-elevated" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-medium text-highlighted">{{ player.nickname }}</div>
                    <div class="truncate text-xs text-muted">{{ [player.realName, source === 'search' ? player.team?.name : null, countryLabel(player.country)].filter(Boolean).join(' · ') || '—' }}</div>
                  </div>
                  <UBadge v-if="player.role" :label="playerRoleLabel(player.role)" color="neutral" variant="outline" size="sm" class="hidden sm:inline-flex" />
                  <UBadge v-if="player.localPlayerId" label="Добавлен" color="neutral" variant="subtle" icon="i-lucide-check" />
                </label>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center justify-between gap-2">
        <span class="text-sm text-muted">Выбрано: {{ selected.size }}</span>
        <div class="flex gap-2">
          <UButton label="Отмена" color="neutral" variant="outline" @click="close" />
          <UButton :label="selected.size ? `Загрузить (${selected.size})` : 'Загрузить'" icon="i-lucide-download" :disabled="!selected.size" :loading="importing" @click="importSelected" />
        </div>
      </div>
    </template>
  </UModal>
</template>
