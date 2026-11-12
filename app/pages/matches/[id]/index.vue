<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Матч' })
const route = useRoute()
const { matches } = useDotaFrameDb()
const hasPackage = computed(() => !!matches.value.find(match => match.id === route.params.id)?.source)
</script>
<template><UDashboardPanel><template #header><AppPageHeader title="Матч" description="Изменения влияют только на новые публикации"><template #actions><UButton v-if="hasPackage" :to="`/matches/${route.params.id}/package`" label="Пакет публикаций" icon="i-lucide-package" /><UButton :to="`/templates?match=${route.params.id}`" label="Создать публикацию" icon="i-lucide-image-plus" :color="hasPackage ? 'neutral' : 'primary'" :variant="hasPackage ? 'outline' : 'solid'" /></template></AppPageHeader></template><template #body><UContainer class="max-w-4xl py-6"><MatchesMatchForm :match-id="String(route.params.id)" /></UContainer></template></UDashboardPanel></template>
