<!-- @level L0-Page -->
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Обзор' })

const { teams, matches, projects, loading } = useDotaFrameDb()
const upcoming = computed(() => matches.value
  .filter(match => match.status === 'scheduled' || match.status === 'live')
  .sort((a, b) => `${a.startDate}T${a.startTime}`.localeCompare(`${b.startDate}T${b.startTime}`))
  .slice(0, 5))
const teamNames = computed(() => Object.fromEntries(teams.value.map(team => [team.id, team.name])))
const stats = computed(() => [
  { label: 'Команды', value: teams.value.length, icon: 'i-lucide-shield', to: '/teams' },
  { label: 'Матчи', value: matches.value.length, icon: 'i-lucide-swords', to: '/matches' },
  { label: 'Публикации', value: projects.value.length, icon: 'i-lucide-images', to: '/projects' }
])
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Обзор" description="Рабочее пространство редактора Dota 2 графики">
        <template #actions>
          <UButton to="/templates" label="Создать публикацию" icon="i-lucide-plus" />
        </template>
      </AppPageHeader>
    </template>
    <template #body>
      <UContainer class="py-6 sm:py-8">
        <section class="relative overflow-hidden rounded-xl border border-default bg-elevated p-6 sm:p-8">
          <div class="df-grid absolute inset-0 opacity-50" aria-hidden="true" />
          <div class="relative max-w-3xl">
            <UBadge color="primary" variant="subtle" label="Локальная студия" icon="i-lucide-sparkles" />
            <h1 class="df-display mt-4 text-4xl font-bold leading-none tracking-tight text-highlighted sm:text-6xl">
              Матчевые данные — в готовую графику
            </h1>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Соберите анонс, результат серии, игровой день или драфт. Данные и изображения остаются в локальной студии.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <UButton to="/templates" size="lg" label="Выбрать шаблон" icon="i-lucide-layout-template" />
              <UButton to="/matches/new" size="lg" color="neutral" variant="outline" label="Добавить матч" icon="i-lucide-swords" />
            </div>
          </div>
        </section>

        <section class="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Статистика">
          <UPageCard v-for="stat in stats" :key="stat.label" :to="stat.to" :icon="stat.icon" :title="String(stat.value)" :description="stat.label" />
        </section>

        <PandascorePandaScoreMatches class="mt-8" />

        <section class="mt-10">
          <div class="mb-3 flex items-end justify-between gap-4">
            <div><h2 class="text-lg font-semibold text-highlighted">Ближайшие матчи</h2><p class="text-sm text-muted">В очереди на публикацию</p></div>
            <UButton to="/matches" label="Все матчи" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" />
          </div>
          <USkeleton v-if="loading" class="h-52 w-full" />
          <UCard v-else-if="upcoming.length" :ui="{ body: 'p-0 sm:p-0' }">
            <div v-for="match in upcoming" :key="match.id" class="flex items-center gap-4 border-b border-default px-4 py-3 last:border-0 sm:px-5">
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-highlighted">{{ teamNames[match.teamAId] || 'Команда A' }} — {{ teamNames[match.teamBId] || 'Команда B' }}</div>
                <div class="mt-0.5 truncate text-sm text-muted">{{ match.tournament || 'Турнир не указан' }} · {{ match.startDate }} {{ match.startTime }}</div>
              </div>
              <UBadge :color="match.status === 'live' ? 'error' : 'neutral'" :label="match.status === 'live' ? 'В эфире' : match.format" variant="subtle" />
              <UButton :to="`/matches/${match.id}`" icon="i-lucide-chevron-right" color="neutral" variant="ghost" aria-label="Открыть матч" />
            </div>
          </UCard>
          <EmptyState v-else icon="i-lucide-calendar-plus" title="Матчей пока нет" description="Добавьте команды и первый матч, чтобы создать публикацию." action-label="Добавить матч" @action="navigateTo('/matches/new')" />
        </section>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
