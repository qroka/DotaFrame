<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Настройки' })
import { apiError } from '~/services/api'
const toast = useToast()
const input = useTemplateRef<HTMLInputElement>('backupInput')
const storage = shallowRef<{ engine: string, file: string, bytes: number } | null>(null)
const restoring = shallowRef(false)
onMounted(async () => { storage.value = await $fetch('/api/system').catch(() => null) })
/** The server streams the file with Content-Disposition: attachment, so the browser saves it straight to disk. */
function downloadBackup() {
  navigateTo('/api/backup', { external: true })
  toast.add({ title: 'Скачивание резервной копии началось', description: 'Файл создаётся по частям, большая база может занять время.', color: 'success' })
}
async function restore(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  restoring.value = true
  try {
    // The file is sent as it is and read line by line on the server; nothing is held in browser memory.
    await $fetch('/api/backup', { method: 'POST', body: file })
    toast.add({ title: 'Данные восстановлены', description: 'Записи объединены с SQLite.', color: 'success' })
    await reloadNuxtApp()
  } catch (cause) { toast.add({ title: 'Не удалось восстановить копию', description: apiError(cause), color: 'error' }) }
  finally { restoring.value = false; if (input.value) input.value.value = '' }
}
type Orphans = { count: number, bytes: number }
const orphans = shallowRef<Orphans | null>(null)
const cleanupOpen = shallowRef(false)
const cleaning = shallowRef(false)
async function checkOrphans() { orphans.value = await $fetch<Orphans>('/api/media/orphans').catch(() => null) }
onMounted(checkOrphans)
async function cleanup() {
  cleaning.value = true
  try {
    const { removed } = await $fetch<{ removed: number }>('/api/media/gc', { method: 'POST', body: { confirm: true } })
    toast.add({ title: 'Изображения удалены', description: `Удалено файлов: ${removed}`, color: 'success' })
    cleanupOpen.value = false
    await Promise.all([checkOrphans(), $fetch('/api/system').then((value: any) => { storage.value = value }).catch(() => {})])
  } catch (cause) { toast.add({ title: 'Не удалось очистить', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { cleaning.value = false }
}
const orphanLabel = computed(() => orphans.value ? `${orphans.value.count} шт., ${(orphans.value.bytes / 1048576).toFixed(2)} МБ` : 'Нет данных')
const storageLabel = computed(() => storage.value ? `${(storage.value.bytes / 1048576).toFixed(2)} МБ` : 'Нет данных')
</script>

<template>
  <UDashboardPanel>
    <template #header><AppPageHeader title="Настройки" description="Избранная команда, резервные копии и серверная база данных" /></template>
    <template #body><UContainer class="max-w-4xl space-y-6 py-6">
      <SettingsFavoriteTeamSetting />
      <UCard><template #header><div><h2 class="font-semibold text-highlighted">Резервная копия</h2><p class="mt-1 text-sm text-muted">JSON-файл содержит команды, матчи, публикации и загруженные изображения.</p></div></template><div class="flex flex-wrap gap-2"><UButton label="Скачать копию" icon="i-lucide-download" @click="downloadBackup" /><UButton label="Восстановить и объединить" icon="i-lucide-upload" color="neutral" variant="outline" :loading="restoring" @click="input?.click()" /><input ref="backupInput" type="file" accept="application/json,.json" class="sr-only" @change="restore"></div></UCard>
      <UCard><template #header><div><h2 class="font-semibold text-highlighted">SQLite</h2><p class="mt-1 text-sm text-muted">Данные хранятся на сервере Nuxt, а не в профиле браузера.</p></div></template><div class="grid gap-4 sm:grid-cols-2"><div class="rounded-lg bg-elevated p-4"><div class="text-sm text-muted">Размер базы</div><div class="mt-1 text-xl font-semibold text-highlighted">{{ storageLabel }}</div></div><div class="rounded-lg bg-elevated p-4"><div class="text-sm text-muted">Файл</div><div class="mt-1 truncate font-mono text-sm text-highlighted">{{ storage?.file || '—' }}</div></div></div></UCard>
      <UCard><template #header><div><h2 class="font-semibold text-highlighted">Неиспользуемые изображения</h2><p class="mt-1 text-sm text-muted">Файлы, на которые не ссылается ни команда, ни публикация, ни её история. Загруженные за последние 24 часа не затрагиваются.</p></div></template><div class="flex flex-wrap items-center gap-3"><span class="text-sm text-muted">Можно освободить: <b class="text-highlighted">{{ orphanLabel }}</b></span><UButton label="Очистить…" icon="i-lucide-trash-2" color="neutral" variant="outline" :disabled="!orphans?.count" @click="cleanupOpen = true" /></div></UCard>
      <UAlert color="info" variant="subtle" icon="i-lucide-database" title="Серверное хранение включено" description="Регулярно сохраняйте резервную копию перед переносом или обновлением сервера." />
    </UContainer></template>
  </UDashboardPanel>
  <UModal v-model:open="cleanupOpen" title="Удалить неиспользуемые изображения?" :description="`Будет удалено: ${orphanLabel}. Действие нельзя отменить. Рекомендуем сначала скачать резервную копию.`">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" :loading="cleaning" @click="cleanup" /></div></template>
  </UModal>
</template>
