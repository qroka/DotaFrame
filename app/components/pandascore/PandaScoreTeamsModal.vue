<!-- @level L2-Controller -->
<script setup lang="ts">
import type { ExternalTeamDetails } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const MAX_PER_IMPORT = 50
const toast = useToast()
const search = shallowRef('')
const teams = shallowRef<ExternalTeamDetails[]>([])
const source = shallowRef<'active' | 'search'>('active')
const loading = shallowRef(false)
const importing = shallowRef(false)
const errorText = shallowRef('')
const selected = ref(new Set<string>())
let requestId = 0
let debounce: ReturnType<typeof setTimeout> | undefined

const newTeams = computed(() => teams.value.filter(team => !team.localTeamId))
const allNewSelected = computed(() => newTeams.value.length > 0 && newTeams.value.every(team => selected.value.has(team.externalId)))

async function load() {
  const current = ++requestId
  loading.value = true
  errorText.value = ''
  try {
    const result = await api.integrations.pandascore.getTeams(search.value.trim())
    if (current !== requestId) return
    teams.value = result.teams
    source.value = result.source
  } catch (cause) {
    if (current !== requestId) return
    teams.value = []
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

function toggle(team: ExternalTeamDetails, value: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (value === true) next.add(team.externalId)
  else next.delete(team.externalId)
  selected.value = next
}
function toggleAllNew() {
  selected.value = allNewSelected.value ? new Set() : new Set(newTeams.value.slice(0, MAX_PER_IMPORT).map(team => team.externalId))
}
function logoUrl(url: string | null) { return url ? `/api/integrations/pandascore/logo?url=${encodeURIComponent(url)}` : undefined }

async function importSelected() {
  const ids = [...selected.value]
  if (!ids.length) return
  if (ids.length > MAX_PER_IMPORT) {
    toast.add({ title: `Выберите не более ${MAX_PER_IMPORT} команд за раз`, color: 'warning' })
    return
  }
  importing.value = true
  try {
    const result = await api.integrations.pandascore.importTeams(ids)
    const parts = [result.created && `добавлено ${result.created}`, result.updated && `обновлено ${result.updated}`].filter(Boolean)
    toast.add({ title: 'Команды загружены из PandaScore', description: parts.join(', '), color: 'success', icon: 'i-lucide-check' })
    emit('imported')
    open.value = false
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить команды', description: apiError(cause), color: 'error' })
  } finally { importing.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Загрузить команды из PandaScore" description="Название, сокращение, регион и логотип подтянутся автоматически. Команды связываются с PandaScore, поэтому их матчи появятся на главной." :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Найти команду в PandaScore…" class="w-full" :loading="loading" />
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="text-muted">{{ source === 'search' ? `Найдено: ${teams.length}` : `Команды из текущих и ближайших матчей: ${teams.length}` }}</span>
          <UButton v-if="newTeams.length" :label="allNewSelected ? 'Снять выбор' : 'Выбрать все новые'" color="neutral" variant="link" size="sm" @click="toggleAllNew" />
        </div>
        <UAlert v-if="errorText" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="errorText" />
        <div v-else-if="loading && !teams.length" class="space-y-2"><USkeleton v-for="n in 6" :key="n" class="h-12 w-full" /></div>
        <p v-else-if="!teams.length" class="py-8 text-center text-sm text-muted">{{ search ? 'Ничего не найдено. Попробуйте другое название.' : 'Сейчас нет ближайших матчей — найдите команду по названию.' }}</p>
        <ul v-else class="max-h-[50vh] divide-y divide-default overflow-y-auto rounded-lg ring ring-default" data-testid="pandascore-team-list">
          <li v-for="team in teams" :key="team.externalId">
            <label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-elevated/50">
              <UCheckbox :model-value="selected.has(team.externalId)" :aria-label="`Выбрать ${team.name}`" @update:model-value="toggle(team, $event)" />
              <UAvatar :src="logoUrl(team.logoUrl)" :alt="team.name" icon="i-df-no-logo" size="md" :ui="{ image: 'object-contain' }" class="bg-elevated" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-highlighted">{{ team.name }}</div>
                <div class="text-xs text-muted">{{ [team.shortName, team.location].filter(Boolean).join(' · ') || '—' }}</div>
              </div>
              <UBadge v-if="team.localTeamId" label="В справочнике" color="neutral" variant="subtle" icon="i-lucide-check" />
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
