<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Новый матч' })
</script>
<template><UDashboardPanel><template #header><AppPageHeader title="Новый матч" description="Добавьте участников, турнир и расписание" /></template><template #body><UContainer class="max-w-4xl py-6"><MatchesMatchForm /></UContainer></template></UDashboardPanel></template>
