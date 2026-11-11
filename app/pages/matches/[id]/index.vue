<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Матч' })
const route = useRoute()
</script>
<template><UDashboardPanel><template #header><AppPageHeader title="Матч" description="Изменения влияют только на новые публикации"><template #actions><UButton :to="`/templates?match=${route.params.id}`" label="Создать публикацию" icon="i-lucide-image-plus" /></template></AppPageHeader></template><template #body><UContainer class="max-w-4xl py-6"><MatchesMatchForm :match-id="String(route.params.id)" /></UContainer></template></UDashboardPanel></template>
