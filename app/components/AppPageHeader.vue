<!-- @level L3-Humble -->
<script setup lang="ts">
defineProps<{ title: string, description?: string, icon?: string }>()
</script>

<template>
  <UDashboardNavbar :title="title">
    <template #leading><UDashboardSidebarCollapse /></template>
    <template #right><slot name="actions" /></template>
  </UDashboardNavbar>
  <div v-if="description" class="border-b border-default px-4 py-2 text-sm text-muted sm:px-6">
    {{ description }}
  </div>
</template>
