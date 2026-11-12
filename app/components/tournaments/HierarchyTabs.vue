<!-- @level L3-Humble -->
<script setup lang="ts">
import { type HierarchyTab, parseHierarchyTab } from '~/utils/tournaments'

defineProps<{ active: HierarchyTab }>()
const { leagues, tournaments, stages } = useDotaFrameDb()
const items = computed(() => [
  { label: 'League', value: 'league', icon: 'i-lucide-flag', badge: leagues.value.length },
  { label: 'Series', value: 'series', icon: 'i-lucide-layers', badge: tournaments.value.length },
  { label: 'Tournament', value: 'tournament', icon: 'i-lucide-trophy', badge: stages.value.length }
])
function select(value: string | number) {
  const tab = parseHierarchyTab(value)
  return navigateTo({ path: '/tournaments', query: tab === 'series' ? {} : { tab } })
}
</script>

<template>
  <UTabs :model-value="active" :items="items" :content="false" size="sm" aria-label="Раздел турниров" data-testid="hierarchy-tabs" @update:model-value="select" />
</template>
