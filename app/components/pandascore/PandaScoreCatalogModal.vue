<!-- @level L2-Controller -->
<script setup lang="ts">
import type { TournamentTier } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { formatTournamentDates } from '~/utils/tournaments'

/** Import dialog for PandaScore leagues and tournaments (stages). Series have their own dialog. */
interface CatalogRow { id: string, title: string, subtitle: string, logoUrl: string | null, tier: TournamentTier | '', localId: string | null }
type ListStatus = 'running' | 'upcoming' | 'past'

const props = defineProps<{ kind: 'league' | 'stage' }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const MAX_PER_IMPORT = 50
const isStage = computed(() => props.kind === 'stage')
const copy = computed(() => isStage.value
  ? { title: 'Загрузить турниры из PandaScore', description: 'Вместе с турниром добавятся его серия и лига. Повторная загрузка обновит сроки и призовой фонд.', placeholder: 'Найти турнир, например Playoffs…', empty: 'В этом разделе сейчас нет турниров.', icon: 'i-lucide-trophy', toast: 'Турниры загружены из PandaScore', error: 'Не удалось загрузить турниры', unit: 'турниров' }
  : { title: 'Загрузить лиги из PandaScore', description: 'Название и логотип лиги подтянутся автоматически. Повторная загрузка обновит логотип.', placeholder: 'Найти лигу, например DreamLeague…', empty: 'Лиги не найдены.', icon: 'i-lucide-flag', toast: 'Лиги загружены из PandaScore', error: 'Не удалось загрузить лиги', unit: 'лиг' })
const tabs = [
  { label: 'Идут', value: 'running', icon: 'i-lucide-radio' },
  { label: 'Скоро', value: 'upcoming', icon: 'i-lucide-calendar-clock' },
  { label: 'Завершённые', value: 'past', icon: 'i-lucide-history' }
]
const toast = useToast()
const status = shallowRef<ListStatus>('running')
const search = shallowRef('')
const rows = shallowRef<CatalogRow[]>([])
const loading = shallowRef(false)
const importing = shallowRef(false)
const errorText = shallowRef('')
const selected = ref(new Set<string>())
let requestId = 0
let debounce: ReturnType<typeof setTimeout> | undefined

const newRows = computed(() => rows.value.filter(item => !item.localId))
const allNewSelected = computed(() => newRows.value.length > 0 && newRows.value.every(item => selected.value.has(item.id)))
const summary = computed(() => search.value.trim() || !isStage.value ? `Найдено: ${rows.value.length}` : `${tabs.find(tab => tab.value === status.value)?.label}: ${rows.value.length}`)

async function load() {
  const current = ++requestId
  loading.value = true
  errorText.value = ''
  try {
    let result: CatalogRow[]
    if (isStage.value) {
      const response = await api.integrations.pandascore.getStages(status.value, search.value.trim())
      result = response.stages.map(item => ({
        id: item.externalId, title: item.name, tier: item.tier, localId: item.localStageId, logoUrl: item.league?.logoUrl ?? null,
        subtitle: [item.serie?.name, formatTournamentDates(item.startDate, item.endDate)].filter(Boolean).join(' · ')
      }))
    } else {
      const response = await api.integrations.pandascore.getLeagues(search.value.trim())
      result = response.leagues.map(item => ({ id: item.externalId, title: item.name, subtitle: '', tier: '', localId: item.localLeagueId, logoUrl: item.logoUrl }))
    }
    if (current !== requestId) return
    rows.value = result
  } catch (cause) {
    if (current !== requestId) return
    rows.value = []
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
  rows.value = []
  load()
}, { immediate: true })

function toggle(item: CatalogRow, value: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (value === true) next.add(item.id)
  else next.delete(item.id)
  selected.value = next
}
function toggleAllNew() {
  selected.value = allNewSelected.value ? new Set() : new Set(newRows.value.slice(0, MAX_PER_IMPORT).map(item => item.id))
}
function logoUrl(url: string | null) { return url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : undefined }

async function importSelected() {
  const ids = [...selected.value]
  if (!ids.length) return
  if (ids.length > MAX_PER_IMPORT) {
    toast.add({ title: `Выберите не более ${MAX_PER_IMPORT} за раз`, color: 'warning' })
    return
  }
  importing.value = true
  try {
    const result = isStage.value ? await api.integrations.pandascore.importStages(ids) : await api.integrations.pandascore.importLeagues(ids)
    const parts = [result.created && `добавлено ${result.created}`, result.updated && `обновлено ${result.updated}`].filter(Boolean)
    toast.add({ title: copy.value.toast, description: parts.join(', '), color: 'success', icon: 'i-lucide-check' })
    emit('imported')
    open.value = false
  } catch (cause) {
    toast.add({ title: copy.value.error, description: apiError(cause), color: 'error' })
  } finally { importing.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="copy.title" :description="copy.description" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-3">
        <UInput v-model="search" icon="i-lucide-search" :placeholder="copy.placeholder" class="w-full" :loading="loading" />
        <UTabs v-if="isStage && !search.trim()" v-model="status" :items="tabs" :content="false" size="sm" class="w-full" />
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-muted">{{ summary }}</span>
          <UButton v-if="newRows.length" :label="allNewSelected ? 'Снять выбор' : 'Выбрать все новые'" color="neutral" variant="link" size="sm" @click="toggleAllNew" />
        </div>
        <UAlert v-if="errorText" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorText" />
        <div v-else-if="loading && !rows.length" class="space-y-2"><USkeleton v-for="n in 6" :key="n" class="h-12 w-full" /></div>
        <p v-else-if="!rows.length" class="py-8 text-center text-sm text-muted">{{ search ? 'Ничего не найдено.' : copy.empty }}</p>
        <ul v-else class="max-h-[50vh] divide-y divide-default overflow-y-auto rounded-lg ring ring-default" :data-testid="`pandascore-${kind}-list`">
          <li v-for="item in rows" :key="item.id">
            <label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-elevated/50">
              <UCheckbox :model-value="selected.has(item.id)" :aria-label="`Выбрать ${item.title}`" @update:model-value="toggle(item, $event)" />
              <UAvatar :src="logoUrl(item.logoUrl)" :alt="item.title" :icon="copy.icon" size="md" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-highlighted">{{ item.title }}</div>
                <div v-if="item.subtitle" class="truncate text-xs text-muted">{{ item.subtitle }}</div>
              </div>
              <UBadge v-if="item.tier" :label="`Tier ${item.tier}`" color="neutral" variant="outline" size="sm" />
              <UBadge v-if="item.localId" label="Добавлен" color="neutral" variant="subtle" icon="i-lucide-check" />
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
