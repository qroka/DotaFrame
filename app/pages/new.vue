<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Новая публикация' })
const route = useRoute()
const matchIds = computed(() => String(route.query.matches ?? '').split(',').filter(Boolean))
</script>
<template><EditorWorkspace :template-id="String(route.query.template || 'match-announcement')" :match-id="route.query.match ? String(route.query.match) : undefined" :match-ids="matchIds" :map-number="Number(route.query.map || 1)" /></template>
