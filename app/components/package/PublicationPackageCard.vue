<!-- @level L3-Humble -->
<script setup lang="ts">
import type { PublicationPackageItem } from '~/types/dotaframe'
import { PACKAGE_STATUS_META, PACKAGE_STATUS_TEXT } from '~/utils/package'

/** One post in the package list; the selected post is shown with its preview on the right. */
const { item, selected = false } = defineProps<{ item: PublicationPackageItem, selected?: boolean }>()
const emit = defineEmits<{ select: [] }>()
const meta = computed(() => PACKAGE_STATUS_META[item.status])
</script>

<template>
  <button
    type="button"
    :data-testid="`package-item-${item.kind}-${item.mapNumber || 0}`"
    :aria-current="selected ? 'true' : undefined"
    class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
    :class="selected ? 'bg-elevated ring ring-default' : ''"
    @click="emit('select')"
  >
    <UIcon :name="meta.icon" class="size-5 shrink-0" :class="PACKAGE_STATUS_TEXT[meta.color]" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-highlighted">{{ item.title }}</span>
      <span class="block truncate text-xs" :class="PACKAGE_STATUS_TEXT[meta.color]">{{ meta.label }}</span>
    </span>
    <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" :class="selected ? 'opacity-100' : 'opacity-0'" />
  </button>
</template>
