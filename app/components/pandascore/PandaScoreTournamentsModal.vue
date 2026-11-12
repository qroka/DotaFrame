<!-- @level L2-Controller -->
<script setup lang="ts">
import type { ExternalTournament } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { formatTournamentDates } from '~/utils/tournaments'

type ListStatus = 'running' | 'upcoming' | 'past'
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const MAX_PER_IMPORT = 50
const tabs = [
  { label: 'Идут', value: 'running', icon: 'i-lucide-radio' },
  { label: 'Скоро', value: 'upcoming', icon: 'i-lucide-calendar-clock' },
  { label: 'Завершённые', value: 'past', icon: 'i-lucide-history' }
]
const toast = useToast()
const status = shallowRef<ListStatus>('running')
const search = shallowRef('')
const tournaments = shallowRef<ExternalTournament[]>([])
const loading = shallowRef(false)
const importing = shallowRef(false)
const errorText = shallowRef('')
const selected = ref(new Set<string>())
let requestId = 0
let debounce: ReturnType<typeof setTimeout> | undefined

const newTournaments = computed(() => tournaments.value.filter(item => !item.localTournamentId))
const allNewSelected = computed(() => newTournaments.value.length > 0 && newTournaments.value.every(item => selected.value.has(item.externalId)))
const summary = computed(() => search.value.trim() ? `Найдено: ${tournaments.value.length}` : `${tabs.find(tab => tab.value === status.value)?.label}: ${tournaments.value.length}`)

async function load() {
  const current = ++requestId
  loading.value = true
  errorText.value = ''
  try {
    const result = await api.integrations.pandascore.getTournaments(status.value, search.value.trim())
    if (current !== requestId) return
    tournaments.value = result.tournaments
  } catch (cause) {
    if (current !== requestId) return
    tournaments.value = []
    errorText.value = apiError(cause)
  } finally { if (current === requestId) loading.value = false }
}

watch(search, () => { clearTimeout(debounce); debounce = setTimeout(load, 350) })
watch(status, () => { if (!search.value.trim()) load() })
watch(open, isOpen => {
  if (!isOpen) return
  selected.value = new Set()
  search.value = ''
  status.value = 'running'
  load()
}, { immediate: true })

function toggle(item: ExternalTournament, value: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (value === true) next.add(item.externalId)
  else next.delete(item.externalId)
  selected.value = next
}
function toggleAllNew() {
  selected.value = allNewSelected.value ? new Set() : new Set(newTournaments.value.slice(0, MAX_PER_IMPORT).map(item => item.externalId))
}
function logoUrl(url: string | null) { return url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : undefined }

async function importSelected() {
  const ids = [...selected.value]
  if (!ids.length) return
  if (ids.length > MAX_PER_IMPORT) {
    toast.add({ title: `Выберите не более ${MAX_PER_IMPORT} турниров за раз`, color: 'warning' })
    return
  }
  importing.value = true
  try {
    const result = await api.integrations.pandascore.importTournaments(ids)
    const parts = [result.created && `добавлено ${result.created}`, result.updated && `обновлено ${result.updated}`].filter(Boolean)
    toast.add({ title: 'Турниры загружены из PandaScore', description: parts.join(', '), color: 'success', icon: 'i-lucide-check' })
    emit('imported')
    open.value = false
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить турниры', description: apiError(cause), color: 'error' })
  } finally { importing.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Загрузить турниры из PandaScore" description="Название, лига, уровень, даты и логотип подтянутся автоматически. Повторная загрузка обновит сроки уже добавленных турниров." :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Найти турнир или лигу, например The International…" class="w-full" :loading="loading" />
        <UTabs v-if="!search.trim()" v-model="status" :items="tabs" :content="false" size="sm" class="w-full" />
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-muted">{{ summary }}</span>
          <UButton v-if="newTournaments.length" :label="allNewSelected ? 'Снять выбор' : 'Выбрать все новые'" color="neutral" variant="link" size="sm" @click="toggleAllNew" />
        </div>
        <UAlert v-if="errorText" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorText" />
        <div v-else-if="loading && !tournaments.length" class="space-y-2"><USkeleton v-for="n in 6" :key="n" class="h-12 w-full" /></div>
        <p v-else-if="!tournaments.length" class="py-8 text-center text-sm text-muted">{{ search ? 'Ничего не найдено. Попробуйте название лиги или год.' : 'В этом разделе сейчас нет турниров.' }}</p>
        <ul v-else class="max-h-[50vh] divide-y divide-default overflow-y-auto rounded-lg ring ring-default" data-testid="pandascore-tournament-list">
          <li v-for="item in tournaments" :key="item.externalId">
            <label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-elevated/50">
              <UCheckbox :model-value="selected.has(item.externalId)" :aria-label="`Выбрать ${item.name}`" @update:model-value="toggle(item, $event)" />
              <UAvatar :src="logoUrl(item.logoUrl)" :alt="item.name" icon="i-lucide-trophy" size="md" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-highlighted">{{ item.name }}</div>
                <div class="text-xs text-muted">{{ formatTournamentDates(item.startDate, item.endDate) }}</div>
              </div>
              <UBadge v-if="item.tier" :label="`Tier ${item.tier}`" color="neutral" variant="outline" size="sm" />
              <UBadge v-if="item.localTournamentId" label="Добавлен" color="neutral" variant="subtle" icon="i-lucide-check" />
            </label>
          </li>
        </ul>
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
