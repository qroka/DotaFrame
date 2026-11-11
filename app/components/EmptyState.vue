<!-- @level L3-Humble -->
<script setup lang="ts">
defineProps<{ icon: string, title: string, description: string, actionLabel?: string }>()
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="grid min-h-72 place-items-center p-8 text-center">
    <div class="max-w-sm">
      <div class="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-elevated ring ring-default">
        <UIcon :name="icon" class="size-6 text-muted" />
      </div>
      <h2 class="text-base font-semibold text-highlighted">{{ title }}</h2>
      <p class="mt-1 text-sm leading-relaxed text-muted">{{ description }}</p>
      <UButton v-if="actionLabel" class="mt-5" :label="actionLabel" icon="i-lucide-plus" @click="emit('action')" />
    </div>
  </div>
</template>
