<!-- @level L1-Feature -->
<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import type { EditorProjectOptions } from '~/composables/useEditorProject'

const props = defineProps<EditorProjectOptions>()
const toast = useToast()
const editor = useEditorProject(props)
const { loading, saving, project: state, template, templates, teams, matches, selectedMatchIds, dirty, canUndo, canRedo } = editor
const exporting = shallowRef(false)
const issues = shallowRef<Array<{ level: 'error' | 'warning', message: string }>>([])
const leftTab = shallowRef('data')
const hasErrors = computed(() => issues.value.some(issue => issue.level === 'error'))

async function exportPng() {
  if (!state.value || !template.value || hasErrors.value) return
  // Every PNG must correspond to a saved version.
  if ((dirty.value || !state.value.id) && !await editor.save()) return
  const current = state.value
  const tpl = template.value
  if (!current || !tpl) return
  exporting.value = true
  try {
    const { renderPng, downloadBlob, exportFileName } = await import('~~/src/export/exportPng')
    const size = tpl.exportSizes.find(item => item.id === current.size) ?? tpl.exportSizes[0]!
    const result = await renderPng({ template: tpl, data: current.data, style: current.style, size })
    downloadBlob(result.blob, exportFileName(current.title, tpl.id, size))
    toast.add({ title: `PNG ${result.width} × ${result.height} готов`, color: 'success' })
  } catch (cause) { toast.add({ title: 'Экспорт не выполнен', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { exporting.value = false }
}
// `meta` is Ctrl on Windows/Linux and Cmd on macOS. Save and export also work while a text field has focus;
// undo/redo are left to the field itself there (native text undo).
defineShortcuts({
  meta_s: { handler: () => editor.save(), usingInput: true },
  meta_shift_e: { handler: exportPng, usingInput: true },
  meta_z: { handler: editor.undo },
  meta_shift_z: { handler: editor.redo },
  meta_y: { handler: editor.redo }
})
onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Покинуть редактор?'))
</script>

<template>
  <div v-if="loading" class="grid h-dvh place-items-center bg-default"><div class="text-center"><UIcon name="i-lucide-loader-circle" class="mx-auto size-8 animate-spin text-primary" /><p class="mt-3 text-sm text-muted">Загрузка редактора…</p></div></div>
  <div v-else-if="!state || !template" class="grid h-dvh place-items-center"><EmptyState icon="i-lucide-file-x" title="Публикация не найдена" description="Возможно, она была удалена." action-label="К публикациям" @action="navigateTo('/projects')" /></div>
  <div v-else class="flex h-dvh min-w-0 flex-col overflow-hidden bg-default">
    <header class="flex h-14 shrink-0 items-center gap-2 border-b border-default px-2 sm:px-3">
      <UButton to="/projects" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="К публикациям" />
      <UInput :model-value="state.title" class="min-w-0 max-w-md flex-1" variant="none" aria-label="Название публикации" @update:model-value="editor.setTitle(String($event))" />
      <UBadge :color="dirty ? 'warning' : 'success'" variant="subtle" :label="dirty ? 'Не сохранено' : 'Сохранено'" class="hidden sm:flex" />
      <div class="ml-auto flex items-center gap-2">
        <USelect :model-value="state.templateId" :items="templates.map(item => ({ label: item.name, value: item.id }))" value-key="value" class="hidden w-56 lg:flex" @update:model-value="editor.switchTemplate(String($event))" />
        <USelect :model-value="state.size" :items="template.exportSizes" label-key="label" value-key="id" class="hidden w-36 md:flex" @update:model-value="editor.setSize(String($event))" />
        <UButton icon="i-lucide-undo-2" color="neutral" variant="ghost" aria-label="Отменить (Ctrl+Z)" :disabled="!canUndo" @click="editor.undo()" />
        <UButton icon="i-lucide-redo-2" color="neutral" variant="ghost" aria-label="Повторить (Ctrl+Shift+Z)" :disabled="!canRedo" @click="editor.redo()" />
        <UButton label="Сохранить" icon="i-lucide-save" color="neutral" variant="outline" :loading="saving" @click="editor.save()" />
        <UButton label="PNG" icon="i-lucide-download" :loading="exporting" :disabled="hasErrors" @click="exportPng" />
      </div>
    </header>
    <div class="flex min-h-0 flex-1">
      <aside class="hidden w-[330px] shrink-0 flex-col border-r border-default bg-default lg:flex" aria-label="Данные публикации">
        <UTabs v-model="leftTab" :items="[{ label: 'Данные', value: 'data', icon: 'i-lucide-database' }, { label: 'Шаблоны', value: 'templates', icon: 'i-lucide-layout-template' }]" class="px-3 pt-3" />
        <div class="min-h-0 flex-1 overflow-y-auto">
          <EditorDataPanel v-if="leftTab === 'data'" :template="template" :data="state.data" :teams="teams" :matches="matches" :selected-match-id="state.matchId" :selected-match-ids="selectedMatchIds" @select-match="editor.selectMatch($event)" @select-matches="editor.selectMatches($event)" @update-text="editor.setText" />
          <div v-else class="space-y-2 p-3"><UButton v-for="item in templates" :key="item.id" :label="item.name" :description="item.description" :color="item.id === state.templateId ? 'primary' : 'neutral'" :variant="item.id === state.templateId ? 'soft' : 'ghost'" block class="justify-start" @click="editor.switchTemplate(item.id)" /></div>
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
        <div class="min-h-0 flex-1 overflow-y-auto"><EditorStylePanel :template="template" :style="state.style" @update-style="editor.setStyle($event)" /></div>
      </aside>
    </div>
  </div>
</template>
