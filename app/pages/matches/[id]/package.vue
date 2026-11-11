<!-- @level L0-Page -->
<script setup lang="ts">
import type { PosterProject, PublicationPackage, PublicationPackageItem } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Пакет публикаций' })
const route = useRoute()
const matchId = String(route.params.id)
const toast = useToast()
const pkg = shallowRef<PublicationPackage | null>(null)
const loading = shallowRef(true)
const syncing = shallowRef(false)
const creatingKey = shallowRef<string | null>(null)
const exportingKey = shallowRef<string | null>(null)
const error = shallowRef<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const teamOptions = computed(() => pkg.value?.teams.map(team => ({ label: team.name, value: team.id })) ?? [])
const trackedTeamId = computed({
  get: () => pkg.value?.trackedTeamId ?? '',
  set: async value => {
    if (!pkg.value) return
    try { pkg.value = await api.matches.getPackage(matchId, value || null) }
    catch (cause) { toast.add({ title: 'Не удалось выбрать команду', description: apiError(cause), color: 'error' }) }
  }
})
const readyCount = computed(() => pkg.value?.items.filter(item => item.status === 'ready').length ?? 0)
const createdItems = computed(() => pkg.value?.items.filter(item => item.status === 'created' && item.projectId) ?? [])
const statGames = computed(() => pkg.value?.games.filter(game => game.statsProvider === 'opendota' && game.stats) ?? [])
function statPlayers(game: PublicationPackage['games'][number]) {
  return Array.isArray(game.stats?.players) ? game.stats.players as Array<Record<string, unknown>> : []
}
function duration(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'
}

async function load() {
  try { pkg.value = await api.matches.getPackage(matchId); error.value = null }
  catch (cause) { error.value = apiError(cause) }
  finally { loading.value = false }
}
async function sync(silent = false) {
  if (syncing.value || document.hidden) return
  syncing.value = true
  try {
    const result = await api.matches.sync(matchId)
    pkg.value = pkg.value?.trackedTeamId ? await api.matches.getPackage(matchId, pkg.value.trackedTeamId) : result.package
    if (!silent) toast.add({ title: 'Данные PandaScore обновлены', color: 'success' })
  } catch (cause) { if (!silent) toast.add({ title: 'Синхронизация не выполнена', description: apiError(cause), color: 'error' }) }
  finally { syncing.value = false }
}
async function createItem(item: PublicationPackageItem, forceNewVersion = false) {
  creatingKey.value = item.key
  try {
    const result = await api.matches.createPackage(matchId, { trackedTeamId: pkg.value?.trackedTeamId, keys: [item.key], forceNewVersion })
    pkg.value = result.package
    const project = result.created[0]
    if (project?.id) await navigateTo(`/editor/${project.id}`)
  } catch (cause) { toast.add({ title: 'Публикация не создана', description: apiError(cause), color: 'error' }) }
  finally { creatingKey.value = null }
}
async function createAllReady() {
  if (!readyCount.value) return
  creatingKey.value = 'all'
  try {
    const result = await api.matches.createPackage(matchId, { trackedTeamId: pkg.value?.trackedTeamId })
    pkg.value = result.package
    toast.add({ title: `Создано публикаций: ${result.created.length}`, color: 'success' })
  } catch (cause) { toast.add({ title: 'Пакет не создан', description: apiError(cause), color: 'error' }) }
  finally { creatingKey.value = null }
}
async function exportProject(projectId: string) {
  const project = await api.projects.get(projectId)
  const [{ getTemplate }, { renderPng, downloadBlob, exportFileName }] = await Promise.all([
    import('~~/src/templates/index.js'), import('~~/src/export/exportPng.js')
  ])
  const template = getTemplate(project.templateId, project.templateVersion)
  if (!template) throw new Error('Версия шаблона недоступна')
  const size = template.exportSizes.find((candidate: any) => candidate.id === project.size) ?? template.exportSizes[0]
  const result = await renderPng({ template, data: project.data, style: project.style, size })
  downloadBlob(result.blob, exportFileName(project.title, template.id, size))
}
async function exportItem(item: PublicationPackageItem) {
  if (!item.projectId) return
  exportingKey.value = item.key
  try { await exportProject(item.projectId) }
  catch (cause) { toast.add({ title: 'Экспорт не выполнен', description: apiError(cause), color: 'error' }) }
  finally { exportingKey.value = null }
}
async function exportPackage() {
  exportingKey.value = 'all'
  try {
    for (const item of createdItems.value) await exportProject(item.projectId!)
    toast.add({ title: `Экспортировано публикаций: ${createdItems.value.length}`, color: 'success' })
  } catch (cause) { toast.add({ title: 'Экспорт пакета прерван', description: apiError(cause), color: 'error' }) }
  finally { exportingKey.value = null }
}
function editDraft(item: PublicationPackageItem) { return navigateTo(`/matches/${matchId}/drafts/${item.mapNumber || 1}`) }

onMounted(async () => {
  await load()
  pollTimer = setInterval(() => sync(true), 45_000)
})
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Пакет публикаций" description="Снимки созданных макетов не меняются после синхронизации">
        <template #actions>
          <UButton label="Обновить данные" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="syncing" @click="sync()" />
          <UButton label="Создать готовые" icon="i-lucide-package-plus" :loading="creatingKey === 'all'" :disabled="!readyCount" @click="createAllReady" />
        </template>
      </AppPageHeader>
    </template>
    <template #body>
      <UContainer class="max-w-6xl py-6 sm:py-8">
        <USkeleton v-if="loading" class="h-96" />
        <UAlert v-else-if="error" color="error" icon="i-lucide-triangle-alert" title="Пакет недоступен" :description="error"><template #actions><UButton label="Повторить" color="error" variant="outline" @click="load" /></template></UAlert>
        <template v-else-if="pkg">
          <UCard class="mb-6" :ui="{ body: 'p-4 sm:p-5' }">
            <div class="flex flex-wrap items-center gap-4">
              <div class="min-w-0 flex-1"><div class="text-lg font-semibold text-highlighted">{{ pkg.teams[0]?.name }} — {{ pkg.teams[1]?.name }}</div><div class="mt-1 text-sm text-muted">{{ pkg.match.tournament }} · {{ pkg.match.format }} · {{ pkg.match.scoreA ?? 0 }}:{{ pkg.match.scoreB ?? 0 }}</div></div>
              <UFormField label="Наша команда" class="w-full sm:w-64"><USelect v-model="trackedTeamId" :items="teamOptions" value-key="value" placeholder="Выберите команду" class="w-full" /></UFormField>
              <div class="text-right text-xs text-muted"><div>Последнее обновление</div><time :datetime="pkg.source.syncedAt">{{ new Date(pkg.source.syncedAt).toLocaleString('ru') }}</time></div>
            </div>
          </UCard>
          <section v-if="statGames.length" class="mb-6" aria-labelledby="stats-heading">
            <div class="mb-3 flex items-center gap-2"><h2 id="stats-heading" class="font-semibold text-highlighted">Статистика завершённых карт</h2><UBadge label="OpenDota" color="neutral" variant="subtle" /></div>
            <div class="grid gap-3">
              <details v-for="game in statGames" :key="game.id" class="group rounded-lg border border-default bg-default">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span class="font-medium text-highlighted">Карта №{{ game.mapNumber }}</span>
                  <span class="text-sm text-muted">{{ game.stats?.radiantScore ?? '—' }}:{{ game.stats?.direScore ?? '—' }} · {{ duration(game.stats?.duration) }}</span>
                </summary>
                <div class="overflow-x-auto border-t border-default p-4">
                  <table class="w-full min-w-[720px] text-left text-sm">
                    <thead class="text-xs text-muted"><tr><th class="pb-2">Игрок</th><th class="pb-2">Герой</th><th class="pb-2">K / D / A</th><th class="pb-2">Net worth</th><th class="pb-2">GPM / XPM</th><th class="pb-2">Урон героя</th></tr></thead>
                    <tbody class="divide-y divide-default">
                      <tr v-for="(player, index) in statPlayers(game)" :key="`${game.id}-${index}`">
                        <td class="py-2 text-highlighted">{{ player.name || 'Не указан' }}</td><td class="py-2">#{{ player.heroId }}</td><td class="py-2 tabular-nums">{{ player.kills ?? '—' }} / {{ player.deaths ?? '—' }} / {{ player.assists ?? '—' }}</td><td class="py-2 tabular-nums">{{ player.netWorth ?? '—' }}</td><td class="py-2 tabular-nums">{{ player.goldPerMinute ?? '—' }} / {{ player.xpPerMinute ?? '—' }}</td><td class="py-2 tabular-nums">{{ player.heroDamage ?? '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-if="!statPlayers(game).length" class="text-sm text-muted">OpenDota передала драфт и итог карты без статистики игроков.</p>
                </div>
              </details>
            </div>
          </section>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted">Готово к созданию: {{ readyCount }} · Создано: {{ createdItems.length }}</p><UButton label="Экспортировать созданный пакет" icon="i-lucide-download" color="neutral" variant="outline" :loading="exportingKey === 'all'" :disabled="!createdItems.length" @click="exportPackage" /></div>
          <div class="grid gap-4 lg:grid-cols-2">
            <PackagePublicationPackageCard v-for="item in pkg.items" :key="item.key" :item="item" :busy="creatingKey === item.key || exportingKey === item.key" @open="navigateTo(`/editor/${item.projectId}`)" @create="createItem(item)" @new-version="createItem(item, true)" @edit-draft="editDraft(item)" @export="exportItem(item)" />
          </div>
        </template>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
