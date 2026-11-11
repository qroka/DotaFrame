<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Редактор' })
const route = useRoute()
</script>
<template><EditorWorkspace :project-id="String(route.params.id)" /></template>
