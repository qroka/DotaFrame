<!-- @level L0-Page -->
<script setup lang="ts">
import type { PosterTemplate } from '~/types/dotaframe'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Шаблоны' })
const route = useRoute()
const templates = shallowRef<PosterTemplate[]>([])
const loading = shallowRef(true)
const typeLabels: Record<string, string> = { announcement: 'Анонс', matchday: 'Игровой день', win: 'Победа', lose: 'Поражение', 'series-result': 'Результат', draft: 'Драфт' }
onMounted(async () => {
  const { listTemplates } = await import('~~/src/templates/index')
  templates.value = listTemplates()
  loading.value = false
})
function start(template: PosterTemplate) {
  const query = new URLSearchParams({ template: template.id })
  if (route.query.match) query.set('match', String(route.query.match))
  return navigateTo(`/new?${query}`)
}
</script>

<template>
  <UDashboardPanel>
    <template #header><AppPageHeader title="Шаблоны" description="Шесть форматов публикаций в общей визуальной системе" /></template>
    <template #body>
      <UContainer class="py-6">
        <div v-if="loading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><USkeleton v-for="n in 6" :key="n" class="h-72" /></div>
        <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UCard v-for="template in templates" :key="template.id" class="overflow-hidden" :ui="{ body: 'p-0 sm:p-0', footer: 'p-4 sm:p-4' }">
            <button type="button" class="df-grid relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-elevated text-left" @click="start(template)">
              <div class="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10" aria-hidden="true" />
              <div class="relative text-center"><div class="df-display text-5xl font-bold tracking-tight text-highlighted">{{ template.type === 'announcement' ? 'MATCH' : typeLabels[template.type]?.toUpperCase() }}</div><div class="mt-2 text-sm text-muted">1080 × 1080</div></div>
            </button>
            <template #footer>
              <div class="flex items-start gap-3"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold text-highlighted">{{ template.name }}</h2><UBadge :label="typeLabels[template.type] || template.type" color="neutral" variant="subtle" /></div><p class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{{ template.description }}</p></div><UButton icon="i-lucide-arrow-up-right" aria-label="Использовать шаблон" @click="start(template)" /></div>
            </template>
          </UCard>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
