<!-- @level L3-Humble -->
<script setup lang="ts">
import type { PublicationPackageItem } from '~/types/dotaframe'

const { item, busy = false } = defineProps<{ item: PublicationPackageItem, busy?: boolean }>()
const emit = defineEmits<{ open: [], create: [], editDraft: [], export: [], newVersion: [] }>()
const meta = computed(() => ({
  ready: { label: 'Готово', color: 'success' as const, icon: 'i-lucide-circle-check' },
  requires_input: { label: 'Требуется заполнение', color: 'warning' as const, icon: 'i-lucide-pencil-line' },
  waiting_for_game: { label: 'Ожидает карту', color: 'neutral' as const, icon: 'i-lucide-clock-3' },
  waiting_for_series: { label: 'Ожидает серию', color: 'neutral' as const, icon: 'i-lucide-clock-3' },
  unavailable: { label: 'Недоступно', color: 'error' as const, icon: 'i-lucide-circle-x' },
  created: { label: 'Создано', color: 'primary' as const, icon: 'i-lucide-image-check' }
})[item.status])
const iconClass = computed(() => ({ success: 'text-success', warning: 'text-warning', neutral: 'text-muted', error: 'text-error', primary: 'text-primary' })[meta.value.color])
</script>

<template>
  <UCard :data-testid="`package-item-${item.kind}-${item.mapNumber || 0}`" :ui="{ body: 'p-4 sm:p-5' }">
    <div class="flex items-start gap-3">
      <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated"><UIcon :name="meta.icon" class="size-5" :class="iconClass" /></div>
      <div class="min-w-0 flex-1"><h3 class="font-semibold text-highlighted">{{ item.title }}</h3><p v-if="item.reason" class="mt-1 text-sm leading-relaxed text-muted">{{ item.reason }}</p><UBadge class="mt-3" :label="meta.label" :color="meta.color" variant="subtle" /></div>
    </div>
    <div class="mt-4 flex flex-wrap justify-end gap-2 border-t border-default pt-4">
      <UButton v-if="item.kind === 'draft' && item.status === 'requires_input'" label="Заполнить драфт" icon="i-lucide-list-plus" color="neutral" variant="outline" @click="emit('editDraft')" />
      <template v-if="item.status === 'created'">
        <UButton label="Экспорт PNG" icon="i-lucide-download" color="neutral" variant="outline" :loading="busy" @click="emit('export')" />
        <UButton label="Открыть" icon="i-lucide-square-arrow-out-up-right" @click="emit('open')" />
        <UButton label="Новая версия" icon="i-lucide-copy-plus" color="neutral" variant="ghost" @click="emit('newVersion')" />
      </template>
      <UButton v-else label="Создать публикацию" icon="i-lucide-image-plus" :loading="busy" :disabled="item.status !== 'ready'" @click="emit('create')" />
    </div>
  </UCard>
</template>
