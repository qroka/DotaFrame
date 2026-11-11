<!-- @level L1-Feature -->
<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { Match, PosterProject, PosterTemplate, Team } from '~/types/dotaframe'
import { api } from '~/services/api'

const props = defineProps<{ projectId?: string, templateId?: string, matchId?: string, matchIds?: string[], mapNumber?: number }>()
const toast = useToast()
const loading = shallowRef(true)
const saving = shallowRef(false)
const exporting = shallowRef(false)
const state = shallowRef<PosterProject | null>(null)
const savedSnapshot = shallowRef('')
const templates = shallowRef<PosterTemplate[]>([])
const template = shallowRef<PosterTemplate | null>(null)
const teams = shallowRef<Team[]>([])
const matches = shallowRef<Match[]>([])
const issues = shallowRef<Array<{ level: 'error' | 'warning', message: string }>>([])
const leftTab = shallowRef('data')
const selectedMatchIds = shallowRef<string[]>(props.matchIds ?? [])
const dirty = computed(() => state.value ? JSON.stringify(state.value) !== savedSnapshot.value : false)
const hasErrors = computed(() => issues.value.some(issue => issue.level === 'error'))

function replace(patch: Partial<PosterProject>) { if (state.value) state.value = { ...state.value, ...patch } }
function cloneCurrent() { return state.value ? structuredClone(state.value) : null }

onMounted(async () => {
  try {
    const [templateModule, factory] = await Promise.all([
      import('~~/src/templates/index.js'), import('~/services/projectFactory')
    ])
    templates.value = templateModule.listTemplates()
    const lookups = await factory.loadLookups()
    teams.value = lookups.teams
    matches.value = lookups.matches
    const project = props.projectId
      ? await api.projects.get(props.projectId)
      : await (factory.newProjectState as any)({ templateId: props.templateId, matchId: props.matchId ?? null, matchIds: props.matchIds ?? [], mapNumber: props.mapNumber ?? 1, lookups })
    if (!project) throw new Error('Публикация не найдена')
    state.value = project
    template.value = templateModule.getTemplate(project.templateId, project.templateVersion) ?? templateModule.getTemplate(project.templateId)
    selectedMatchIds.value = project.data?.items?.map((item: any) => item.matchId).filter(Boolean) ?? props.matchIds ?? []
    savedSnapshot.value = props.projectId ? JSON.stringify(project) : ''
  } catch (cause) {
    toast.add({ title: 'Не удалось открыть редактор', description: cause instanceof Error ? cause.message : String(cause), color: 'error' })
  } finally { loading.value = false }
})

async function rebuildData(matchId?: string, matchIds = selectedMatchIds.value) {
  if (!state.value || !template.value) return
  const factory = await import('~/services/projectFactory')
  const lookups = { teams: teams.value, matches: matches.value, teamsById: Object.fromEntries(teams.value.map(team => [team.id, team])) }
  const data = await (factory.buildData as any)(template.value, { matchId: matchId ?? null, matchIds, mapNumber: state.value.data.mapNumber ?? props.mapNumber ?? 1, texts: state.value.data.texts, lookups })
  replace({ matchId: matchId ?? null, data })
}
async function selectMatches(ids: string[]) { selectedMatchIds.value = ids.slice(0, 6); await rebuildData(undefined, selectedMatchIds.value) }
function updateText(key: string, value: string) { if (state.value) replace({ data: { ...state.value.data, texts: { ...state.value.data.texts, [key]: value } } }) }

async function switchTemplate(id: string) {
  if (!state.value || id === state.value.templateId) return
  const [{ switchTemplateState }, templateModule] = await Promise.all([import('~/services/projectFactory'), import('~~/src/templates/index.js')])
  const lookups = { teams: teams.value, matches: matches.value, teamsById: Object.fromEntries(teams.value.map(team => [team.id, team])) }
  state.value = await switchTemplateState(state.value, id, lookups)
  template.value = templateModule.getTemplate(id)
}
async function save() {
  if (!state.value) return
  saving.value = true
  try {
    const saved = await api.projects.save(cloneCurrent()!, state.value.id ? 'Изменения в редакторе' : 'Первая версия')
    state.value = saved
    savedSnapshot.value = JSON.stringify(saved)
    toast.add({ title: 'Публикация сохранена', color: 'success', icon: 'i-lucide-check' })
    if (!props.projectId) await navigateTo(`/editor/${saved.id}`, { replace: true })
  } catch (cause) { toast.add({ title: 'Не удалось сохранить', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { saving.value = false }
}
async function exportPng() {
  if (!state.value || !template.value || hasErrors.value) return
  if (dirty.value || !state.value.id) await save()
  exporting.value = true
  try {
    const { renderPng, downloadBlob, exportFileName } = await import('~~/src/export/exportPng.js')
    const size = template.value.exportSizes.find(item => item.id === state.value?.size) ?? template.value.exportSizes[0]
    const result = await renderPng({ template: template.value, data: state.value.data, style: state.value.style, size })
    downloadBlob(result.blob, exportFileName(state.value.title, template.value.id, size))
    toast.add({ title: `PNG ${result.width} × ${result.height} готов`, color: 'success' })
  } catch (cause) { toast.add({ title: 'Экспорт не выполнен', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { exporting.value = false }
}
defineShortcuts({ meta_s: { handler: save }, meta_shift_e: { handler: exportPng } })
onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Покинуть редактор?'))
</script>

<template>
  <div v-if="loading" class="grid h-dvh place-items-center bg-default"><div class="text-center"><UIcon name="i-lucide-loader-circle" class="mx-auto size-8 animate-spin text-primary" /><p class="mt-3 text-sm text-muted">Загрузка редактора…</p></div></div>
  <div v-else-if="!state || !template" class="grid h-dvh place-items-center"><EmptyState icon="i-lucide-file-x" title="Публикация не найдена" description="Возможно, она была удалена." action-label="К публикациям" @action="navigateTo('/projects')" /></div>
  <div v-else class="flex h-dvh min-w-0 flex-col overflow-hidden bg-default">
    <header class="flex h-14 shrink-0 items-center gap-2 border-b border-default px-2 sm:px-3">
      <UButton to="/projects" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="К публикациям" />
      <UInput :model-value="state.title" class="min-w-0 max-w-md flex-1" variant="none" aria-label="Название публикации" @update:model-value="replace({ title: String($event) })" />
      <UBadge :color="dirty ? 'warning' : 'success'" variant="subtle" :label="dirty ? 'Не сохранено' : 'Сохранено'" class="hidden sm:flex" />
      <div class="ml-auto flex items-center gap-2">
        <USelect :model-value="state.templateId" :items="templates.map(item => ({ label: item.name, value: item.id }))" value-key="value" class="hidden w-56 lg:flex" @update:model-value="switchTemplate(String($event))" />
        <USelect :model-value="state.size" :items="template.exportSizes" label-key="label" value-key="id" class="hidden w-36 md:flex" @update:model-value="replace({ size: String($event) })" />
        <UButton label="Сохранить" icon="i-lucide-save" color="neutral" variant="outline" :loading="saving" @click="save" />
        <UButton label="PNG" icon="i-lucide-download" :loading="exporting" :disabled="hasErrors" @click="exportPng" />
      </div>
    </header>
    <div class="flex min-h-0 flex-1">
      <aside class="hidden w-[330px] shrink-0 flex-col border-r border-default bg-default lg:flex" aria-label="Данные публикации">
        <UTabs v-model="leftTab" :items="[{ label: 'Данные', value: 'data', icon: 'i-lucide-database' }, { label: 'Шаблоны', value: 'templates', icon: 'i-lucide-layout-template' }]" class="px-3 pt-3" />
        <div class="min-h-0 flex-1 overflow-y-auto">
          <EditorDataPanel v-if="leftTab === 'data'" :template="template" :data="state.data" :teams="teams" :matches="matches" :selected-match-id="state.matchId" :selected-match-ids="selectedMatchIds" @select-match="rebuildData($event)" @select-matches="selectMatches" @update-text="updateText" />
          <div v-else class="space-y-2 p-3"><UButton v-for="item in templates" :key="item.id" :label="item.name" :description="item.description" :color="item.id === state.templateId ? 'primary' : 'neutral'" :variant="item.id === state.templateId ? 'soft' : 'ghost'" block class="justify-start" @click="switchTemplate(item.id)" /></div>
        </div>
      </aside>
      <main class="flex min-w-0 flex-1 flex-col">
        <EditorPosterPreview :template="template" :data="state.data" :style="state.style" @issues="issues = $event" />
        <div class="flex min-h-11 shrink-0 items-center gap-3 overflow-x-auto border-t border-default bg-default px-4 py-2" role="status" aria-live="polite">
          <span v-if="!issues.length" class="flex items-center gap-2 text-xs text-success"><UIcon name="i-lucide-circle-check" /> Макет готов</span>
          <span v-for="issue in issues" :key="issue.message" class="flex items-center gap-1.5 whitespace-nowrap text-xs" :class="issue.level === 'error' ? 'text-error' : 'text-warning'"><UIcon :name="issue.level === 'error' ? 'i-lucide-circle-x' : 'i-lucide-triangle-alert'" />{{ issue.message }}</span>
        </div>
      </main>
      <aside class="hidden w-[310px] shrink-0 flex-col border-l border-default bg-default xl:flex" aria-label="Оформление">
        <div class="border-b border-default px-4 py-3 text-sm font-semibold text-highlighted">Оформление</div>
        <div class="min-h-0 flex-1 overflow-y-auto"><EditorStylePanel :template="template" :style="state.style" @update-style="replace({ style: $event })" /></div>
      </aside>
    </div>
  </div>
</template>
