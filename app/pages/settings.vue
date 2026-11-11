<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Настройки' })
const toast = useToast()
const input = useTemplateRef<HTMLInputElement>('backupInput')
const storage = shallowRef<{ engine: string, file: string, bytes: number } | null>(null)
const restoring = shallowRef(false)
onMounted(async () => { storage.value = await $fetch('/api/system').catch(() => null) })
async function downloadBackup() {
  const { downloadBlob } = await import('~~/src/export/exportPng.js')
  const backup = await $fetch('/api/backup')
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `dotaframe-backup-${new Date().toISOString().slice(0, 10)}.json`)
  toast.add({ title: 'Резервная копия создана', color: 'success' })
}
async function restore(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  restoring.value = true
  try {
    await $fetch('/api/backup', { method: 'POST', body: JSON.parse(await file.text()) })
    toast.add({ title: 'Данные восстановлены', description: 'Записи объединены с SQLite.', color: 'success' })
    await reloadNuxtApp()
  } catch (cause) { toast.add({ title: 'Не удалось восстановить копию', description: cause instanceof Error ? cause.message : String(cause), color: 'error' }) }
  finally { restoring.value = false; if (input.value) input.value.value = '' }
}
const storageLabel = computed(() => storage.value ? `${(storage.value.bytes / 1048576).toFixed(2)} МБ` : 'Нет данных')
</script>

<template>
  <UDashboardPanel>
    <template #header><AppPageHeader title="Настройки" description="Резервные копии и серверная база данных" /></template>
    <template #body><UContainer class="max-w-4xl space-y-6 py-6">
      <UCard><template #header><div><h2 class="font-semibold text-highlighted">Резервная копия</h2><p class="mt-1 text-sm text-muted">JSON-файл содержит команды, матчи, публикации и загруженные изображения.</p></div></template><div class="flex flex-wrap gap-2"><UButton label="Скачать копию" icon="i-lucide-download" @click="downloadBackup" /><UButton label="Восстановить и объединить" icon="i-lucide-upload" color="neutral" variant="outline" :loading="restoring" @click="input?.click()" /><input ref="backupInput" type="file" accept="application/json,.json" class="sr-only" @change="restore"></div></UCard>
      <UCard><template #header><div><h2 class="font-semibold text-highlighted">SQLite</h2><p class="mt-1 text-sm text-muted">Данные хранятся на сервере Nuxt, а не в профиле браузера.</p></div></template><div class="grid gap-4 sm:grid-cols-2"><div class="rounded-lg bg-elevated p-4"><div class="text-sm text-muted">Размер базы</div><div class="mt-1 text-xl font-semibold text-highlighted">{{ storageLabel }}</div></div><div class="rounded-lg bg-elevated p-4"><div class="text-sm text-muted">Файл</div><div class="mt-1 truncate font-mono text-sm text-highlighted">{{ storage?.file || '—' }}</div></div></div></UCard>
      <UAlert color="info" variant="subtle" icon="i-lucide-database" title="Серверное хранение включено" description="Регулярно сохраняйте резервную копию перед переносом или обновлением сервера." />
    </UContainer></template>
  </UDashboardPanel>
</template>
