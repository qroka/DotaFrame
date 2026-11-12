<!-- @level L2-Controller -->
<script setup lang="ts">
import type { PosterTemplate } from '~/types/dotaframe'
import type { PosterStyle } from '~~/src/templates/types'
import { api } from '~/services/api'

const props = defineProps<{ template: PosterTemplate, style: Record<string, any> }>()
const emit = defineEmits<{ updateStyle: [style: Record<string, any>] }>()
const toast = useToast()
const groupLabels: Record<string, string> = { theme: 'Тема', colors: 'Цвета', background: 'Фон', player: 'Игрок / персонаж', typography: 'Типографика', layout: 'Композиция', elements: 'Элементы', socials: 'Подписи и соцсети' }
const groups = computed(() => {
  const visible = props.template.settings.filter(setting => !setting.when || setting.when(props.style as PosterStyle))
  return Object.entries(Object.groupBy(visible, setting => setting.group || 'layout'))
})
function get(path: string): any { return path.split('.').reduce<any>((value, key) => value?.[key], props.style) }
function set(path: string, value: any) {
  const next = structuredClone(props.style)
  const keys = path.split('.')
  let cursor = next
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {}
  cursor[keys.at(-1)!] = value
  emit('updateStyle', next)
}
async function setTheme(theme: string) {
  const { applyTheme } = await import('~~/src/templates/shared/settings')
  emit('updateStyle', applyTheme(props.style, theme))
}
async function upload(setting: Record<string, any>, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const asset = await api.upload(file, setting.kind)
    set(setting.key, asset.id)
  } catch (cause) { toast.add({ title: 'Не удалось загрузить изображение', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { input.value = '' }
}
</script>

<template>
  <div class="divide-y divide-default">
    <section v-for="[group, settings] in groups" :key="group" class="space-y-4 p-4">
      <h2 class="text-sm font-semibold text-highlighted">{{ groupLabels[group] || group }}</h2>
      <div v-for="setting in settings" :key="setting.key">
        <UFormField v-if="setting.type === 'range'" :label="setting.label" :hint="`${get(setting.key)}${setting.unit || ''}`">
          <USlider :model-value="Number(get(setting.key))" :min="setting.min" :max="setting.max" :step="setting.step" @update:model-value="set(setting.key, $event)" />
        </UFormField>
        <UFormField v-else-if="setting.type === 'color'" :label="setting.label">
          <div class="flex gap-2"><UInput :model-value="String(get(setting.key) ?? '')" class="flex-1" @update:model-value="set(setting.key, $event)" /><input type="color" :value="String(get(setting.key) ?? '#000000')" class="h-8 w-10 cursor-pointer rounded border border-default bg-transparent p-1" :aria-label="setting.label" @input="set(setting.key, ($event.target as HTMLInputElement).value)"></div>
        </UFormField>
        <UFormField v-else-if="['select', 'segmented', 'font', 'background'].includes(setting.type)" :label="setting.label">
          <USelect :model-value="get(setting.key) as any" :items="setting.options" value-key="value" class="w-full" @update:model-value="setting.type === 'theme' ? setTheme(String($event)) : set(setting.key, $event)" />
        </UFormField>
        <UFormField v-else-if="setting.type === 'theme'" :label="setting.label">
          <USelect :model-value="get(setting.key) as any" :items="setting.options" value-key="value" class="w-full" @update:model-value="setTheme(String($event))" />
        </UFormField>
        <UFormField v-else-if="setting.type === 'text'" :label="setting.label"><UInput :model-value="String(get(setting.key) ?? '')" :maxlength="setting.maxLength" class="w-full" @update:model-value="set(setting.key, $event)" /></UFormField>
        <USwitch v-else-if="setting.type === 'toggle'" :model-value="get(setting.key)" :label="setting.label" @update:model-value="set(setting.key, $event)" />
        <UFormField v-else-if="setting.type === 'image'" :label="setting.label" :description="setting.hint">
          <div class="flex gap-2"><UButton as="label" class="cursor-pointer" color="neutral" variant="outline" icon="i-lucide-upload" label="Выбрать файл"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" class="sr-only" @change="upload(setting, $event)"></UButton><UButton v-if="get(setting.key)" label="Убрать" color="neutral" variant="ghost" @click="set(setting.key, null)" /></div>
        </UFormField>
      </div>
    </section>
  </div>
</template>
