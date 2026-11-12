<!-- @level L0-Page -->
<script setup lang="ts">
import { api, apiError } from '~/services/api'
import { type FixtureView, externalFixture, externalSide, fixtureForm, fixtureRecord, localFixture, sortResults, sortUpcoming } from '~/utils/matches'
import { countryLabel, playerRoleLabel } from '~/utils/players'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Обзор' })

const { teams, matches, projects, players, ready, refresh } = useDotaFrameDb()
const favorite = useFavoriteTeam()
const { team } = favorite
const toast = useToast()
const now = shallowRef(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  favorite.ensureLoaded()
  timer = setInterval(() => { now.value = new Date() }, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))

const booting = computed(() => !ready.value || !favorite.loaded.value)
const present = <T,>(value: T | null): value is T => value !== null
const teamsById = computed(() => new Map(teams.value.map(item => [item.id, item])))
const teamMatches = computed(() => team.value ? matches.value.filter(match => match.teamAId === team.value!.id || match.teamBId === team.value!.id) : [])
const fixtures = computed(() => team.value ? teamMatches.value.map(match => localFixture(match, team.value!.id, teamsById.value)).filter(present) : [])

/* PandaScore matches of the team (live, upcoming and finished). Those already imported are shown as studio matches. */
const external = shallowRef<FixtureView[]>([])
const externalLoading = shallowRef(false)
const externalError = shallowRef('')
const importedIds = computed(() => new Set(matches.value.flatMap(match => match.source ? [match.source.externalId] : [])))
async function loadExternal() {
  const current = team.value
  if (!current) { external.value = []; return }
  externalLoading.value = true
  externalError.value = ''
  try {
    const lists = await Promise.all((['running', 'upcoming', 'past'] as const).map(status => api.integrations.pandascore.getMatches(status)))
    if (team.value?.id !== current.id) return
    external.value = lists.flatMap(list => list.matches).flatMap(match => {
      const side = externalSide(match, current)
      return side ? [externalFixture(match, side)] : []
    })
  } catch (cause) {
    external.value = []
    externalError.value = apiError(cause)
  } finally { externalLoading.value = false }
}
watch(() => team.value?.id, loadExternal, { immediate: true })

const notImported = computed(() => external.value.filter(fixture => !importedIds.value.has(fixture.externalMatch!.externalId)))
const upcoming = computed(() => sortUpcoming([
  ...fixtures.value.filter(fixture => fixture.status === 'scheduled' || fixture.status === 'live'),
  ...notImported.value.filter(fixture => fixture.status === 'scheduled' || fixture.status === 'live')
]))
const completed = computed(() => [
  ...fixtures.value.filter(fixture => fixture.status === 'completed'),
  ...notImported.value.filter(fixture => fixture.status === 'completed')
])
const record = computed(() => fixtureRecord(completed.value))
const form = computed(() => fixtureForm(completed.value))
const next = computed(() => upcoming.value[0] ?? null)
const schedule = computed(() => upcoming.value.slice(1, 8))
const results = computed(() => sortResults(completed.value).slice(0, 8))

const importing = shallowRef<string | null>(null)
async function createPackage(fixture: FixtureView) {
  const match = fixture.externalMatch
  if (!match || !team.value || !fixture.ownExternalId) return
  importing.value = fixture.key
  try {
    const result = await api.integrations.pandascore.importMatch(match.externalId, [{ externalId: fixture.ownExternalId, localId: team.value.id }])
    await refresh()
    await navigateTo(`/matches/${result.matchId}/package`)
  } catch (cause) { toast.add({ title: 'Не удалось создать пакет', description: apiError(cause), color: 'error' }) }
  finally { importing.value = null }
}

const roster = computed(() => team.value
  ? players.value.filter(player => player.teamId === team.value!.id).sort((a, b) => (a.role || '9').localeCompare(b.role || '9') || a.nickname.localeCompare(b.nickname, 'ru'))
  : [])
const teamProjects = computed(() => {
  const ids = new Set(teamMatches.value.map(match => match.id))
  return projects.value.filter(project => project.matchId && ids.has(project.matchId)).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
})
const tournaments = computed(() => {
  const byName = new Map<string, { name: string, count: number, last: string }>()
  for (const match of teamMatches.value) {
    const name = match.tournament.trim()
    if (!name) continue
    const entry = byName.get(name.toLocaleLowerCase('ru')) ?? { name, count: 0, last: '' }
    entry.count++
    if (match.startDate > entry.last) entry.last = match.startDate
    byName.set(name.toLocaleLowerCase('ru'), entry)
  }
  return [...byName.values()].sort((a, b) => b.last.localeCompare(a.last)).slice(0, 6)
})
const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10
  const mod100 = count % 100
  return `${count} ${mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many}`
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Обзор" :description="team ? `Всё о команде ${team.name}` : 'Выберите избранную команду в настройках, и здесь соберётся всё о ней'">
        <template #actions>
          <UButton to="/matches/new" label="Добавить матч" icon="i-lucide-swords" color="neutral" variant="outline" class="hidden sm:inline-flex" />
          <UButton to="/templates" label="Создать публикацию" icon="i-lucide-plus" />
        </template>
      </AppPageHeader>
    </template>
    <template #body>
      <UContainer class="py-6 sm:py-8">
        <USkeleton v-if="booting" class="h-96 w-full" />

        <section v-else-if="!teams.length" class="grid min-h-72 place-items-center rounded-xl border border-dashed border-default p-8 text-center" data-testid="overview-no-teams">
          <div class="max-w-md">
            <UIcon name="i-lucide-shield-plus" class="mx-auto size-10 text-dimmed" />
            <h1 class="mt-3 text-lg font-semibold text-highlighted">Сначала добавьте команды</h1>
            <p class="mt-1 text-sm text-muted">Добавьте команду вручную или загрузите из PandaScore, затем выберите её избранной в настройках.</p>
            <UButton to="/teams" label="Перейти к командам" icon="i-lucide-shield" class="mt-5" />
          </div>
        </section>

        <section v-else-if="!team" class="grid min-h-72 place-items-center rounded-xl border border-dashed border-default p-8 text-center" data-testid="overview-no-favorite">
          <div class="max-w-md">
            <UIcon name="i-lucide-star" class="mx-auto size-10 text-dimmed" />
            <h1 class="mt-3 text-lg font-semibold text-highlighted">Выберите избранную команду</h1>
            <p class="mt-1 text-sm text-muted">Её ближайшие матчи, результаты, состав и публикации соберутся на этой странице.</p>
            <UButton to="/settings#favorite-team" label="Выбрать в настройках" icon="i-lucide-settings-2" class="mt-5" />
          </div>
        </section>

        <div v-else class="space-y-6">
          <OverviewTeamHeader :team="team" :record="record" :form="form" />

          <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="min-w-0 space-y-6">
              <section aria-labelledby="next-heading">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h2 id="next-heading" class="text-lg font-semibold text-highlighted">Ближайший матч</h2>
                  <UButton label="Обновить" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="externalLoading" @click="loadExternal" />
                </div>
                <UAlert v-if="externalError" class="mb-3" color="warning" variant="subtle" icon="i-lucide-cloud-off" title="PandaScore недоступен" :description="`Показаны только матчи из студии. ${externalError}`" />
                <OverviewMatchCard v-if="next" :fixture="next" :team="team" :now="now" :busy="importing === next.key" @create-package="createPackage(next)" />
                <UCard v-else :ui="{ body: 'p-6' }">
                  <div class="text-center">
                    <UIcon name="i-lucide-calendar-x" class="mx-auto size-8 text-dimmed" />
                    <p class="mt-2 font-medium text-highlighted">Ближайших матчей нет</p>
                    <p class="mt-1 text-sm text-muted">Добавьте матч вручную{{ externalLoading ? '' : ' или дождитесь расписания PandaScore' }}.</p>
                    <div class="mt-4 flex flex-wrap justify-center gap-2">
                      <UButton to="/matches?tab=pandascore" label="Искать в PandaScore" icon="i-lucide-cloud-download" />
                      <UButton to="/matches/new" label="Добавить матч" icon="i-lucide-plus" color="neutral" variant="outline" />
                    </div>
                  </div>
                </UCard>
              </section>

              <section v-if="schedule.length" aria-labelledby="schedule-heading">
                <h2 id="schedule-heading" class="mb-3 text-lg font-semibold text-highlighted">Расписание</h2>
                <UCard :ui="{ body: 'p-0 sm:p-0' }"><ul class="divide-y divide-default" data-testid="schedule-list"><OverviewMatchRow v-for="fixture in schedule" :key="fixture.key" :fixture="fixture" :now="now" :busy="importing === fixture.key" @create-package="createPackage(fixture)" /></ul></UCard>
              </section>

              <section aria-labelledby="results-heading">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h2 id="results-heading" class="text-lg font-semibold text-highlighted">Последние результаты</h2>
                  <UButton v-if="teamMatches.length" to="/matches" label="Все матчи" color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-right" />
                </div>
                <UCard v-if="results.length" :ui="{ body: 'p-0 sm:p-0' }"><ul class="divide-y divide-default" data-testid="results-list"><OverviewMatchRow v-for="fixture in results" :key="fixture.key" :fixture="fixture" :now="now" :busy="importing === fixture.key" @create-package="createPackage(fixture)" /></ul></UCard>
                <p v-else class="rounded-lg border border-dashed border-default p-5 text-center text-sm text-muted">Завершённых матчей пока нет.</p>
              </section>
            </div>

            <aside class="space-y-6">
              <section aria-labelledby="roster-heading">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h2 id="roster-heading" class="text-lg font-semibold text-highlighted">Состав</h2>
                  <UButton to="/players" label="Игроки" color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-right" />
                </div>
                <UCard :ui="{ body: 'p-0 sm:p-0' }">
                  <ul v-if="roster.length" class="divide-y divide-default" data-testid="roster-list">
                    <li v-for="player in roster" :key="player.id" class="flex items-center gap-3 px-4 py-2.5">
                      <UAvatar :src="player.photoAssetId ? `/api/media/${player.photoAssetId}` : undefined" :alt="player.nickname" icon="i-lucide-user" size="sm" class="shrink-0 bg-elevated" />
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-medium text-highlighted">{{ player.nickname }}</div>
                        <div class="truncate text-xs text-muted">{{ [player.realName, countryLabel(player.country)].filter(Boolean).join(' · ') || '—' }}</div>
                      </div>
                      <span v-if="player.role" class="shrink-0 text-xs text-muted">{{ playerRoleLabel(player.role) }}</span>
                    </li>
                  </ul>
                  <div v-else class="p-5 text-center">
                    <p class="text-sm text-muted">Игроков команды пока нет.</p>
                    <UButton to="/players" label="Загрузить состав" icon="i-lucide-cloud-download" color="neutral" variant="outline" size="sm" class="mt-3" />
                  </div>
                </UCard>
              </section>

              <section aria-labelledby="posts-heading">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h2 id="posts-heading" class="text-lg font-semibold text-highlighted">Публикации</h2>
                  <UButton to="/projects" label="Все" color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-right" />
                </div>
                <UCard :ui="{ body: 'p-0 sm:p-0' }">
                  <ul v-if="teamProjects.length" class="divide-y divide-default" data-testid="projects-list">
                    <li v-for="project in teamProjects.slice(0, 5)" :key="project.id ?? project.title">
                      <NuxtLink :to="`/editor/${project.id}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-elevated/60">
                        <UIcon name="i-lucide-image" class="size-5 shrink-0 text-dimmed" />
                        <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-highlighted">{{ project.title }}</span><span class="block truncate text-xs text-muted">{{ project.updatedAt ? new Date(project.updatedAt).toLocaleString('ru') : 'Черновик' }}</span></span>
                      </NuxtLink>
                    </li>
                    <li v-if="teamProjects.length > 5" class="px-4 py-2 text-xs text-muted">Ещё {{ plural(teamProjects.length - 5, 'публикация', 'публикации', 'публикаций') }}</li>
                  </ul>
                  <div v-else class="p-5 text-center">
                    <p class="text-sm text-muted">Публикаций по матчам команды пока нет.</p>
                    <UButton to="/templates" label="Создать публикацию" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" class="mt-3" />
                  </div>
                </UCard>
              </section>

              <section v-if="tournaments.length" aria-labelledby="tournaments-heading">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h2 id="tournaments-heading" class="text-lg font-semibold text-highlighted">Турниры</h2>
                  <UButton to="/tournaments" label="Все" color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-arrow-right" />
                </div>
                <UCard :ui="{ body: 'p-0 sm:p-0' }">
                  <ul class="divide-y divide-default" data-testid="tournaments-list">
                    <li v-for="item in tournaments" :key="item.name" class="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span class="min-w-0 truncate text-sm font-medium text-highlighted">{{ item.name }}</span>
                      <span class="shrink-0 text-xs text-muted">{{ plural(item.count, 'матч', 'матча', 'матчей') }}</span>
                    </li>
                  </ul>
                </UCard>
              </section>
            </aside>
          </div>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
