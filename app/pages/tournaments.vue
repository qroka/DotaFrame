<!-- @level L0-Page -->
<script setup lang="ts">
import { parseHierarchyTab } from '~/utils/tournaments'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Турниры' })
const route = useRoute()
const tab = computed(() => parseHierarchyTab(route.query.tab))
</script>

<template>
  <TournamentsLeaguesPanel v-if="tab === 'league'" />
  <TournamentsStagesPanel v-else-if="tab === 'tournament'" />
  <TournamentsSeriesPanel v-else />
</template>
