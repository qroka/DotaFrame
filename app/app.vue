<script setup lang="ts">
import { ru } from '@nuxt/ui/locale'

useHead({ title: 'DotaFrame' })
</script>

<template>
  <UApp :locale="ru">
    <NuxtLoadingIndicator color="#ef4444" />
    <NuxtLayout><NuxtPage /></NuxtLayout>
  </UApp>
</template>
