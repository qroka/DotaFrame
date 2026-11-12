<!-- @level L0-Page -->
<script setup lang="ts">
import type { PackageItemPreview, PosterTemplate, PublicationPackage, PublicationPackageItem } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { PACKAGE_STATUS_META, groupPackageItems, needsWork } from '~/utils/package'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Пакет публикаций' })
const route = useRoute()
const matchId = String(route.params.id)
const toast = useToast()
const pkg = shallowRef<PublicationPackage | null>(null)
const previews = shallowRef(new Map<string, PackageItemPreview>())
const templates = shallowRef(new Map<string, PosterTemplate>())
const selectedKey = shallowRef<string | null>(null)
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
    try { await applyPackage(await api.matches.getPackage(matchId, value || null)) }
    catch (cause) { toast.add({ title: 'Не удалось выбрать команду', description: apiError(cause), color: 'error' }) }
  }
})
const groups = computed(() => groupPackageItems(pkg.value?.items ?? []))
const readyCount = computed(() => pkg.value?.items.filter(item => item.status === 'ready').length ?? 0)
const createdItems = computed(() => pkg.value?.items.filter(item => item.status === 'created' && item.projectId) ?? [])
const workCount = computed(() => pkg.value?.items.filter(needsWork).length ?? 0)
const waitingCount = computed(() => pkg.value?.items.filter(item => item.status === 'waiting_for_game' || item.status === 'waiting_for_series').length ?? 0)
const selected = computed(() => pkg.value?.items.find(item => item.key === selectedKey.value) ?? null)
const selectedMeta = computed(() => selected.value ? PACKAGE_STATUS_META[selected.value.status] : null)
const selectedPreview = computed(() => selected.value ? previews.value.get(selected.value.key) ?? null : null)
const selectedTemplate = computed(() => selectedPreview.value ? templates.value.get(templateKey(selectedPreview.value)) ?? null : null)
const statGames = computed(() => pkg.value?.games.filter(game => game.statsProvider === 'opendota' && game.stats) ?? [])
function statPlayers(game: PublicationPackage['games'][number]) {
  return Array.isArray(game.stats?.players) ? game.stats.players as Array<Record<string, unknown>> : []
}
function duration(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'
}
const templateKey = (preview: { templateId: string, templateVersion: number }) => `${preview.templateId}@${preview.templateVersion}`

/** Store a fresh package, keep the current selection when possible and refresh the previews. */
async function applyPackage(next: PublicationPackage) {
  pkg.value = next
  if (!next.items.some(item => item.key === selectedKey.value)) {
    // Keys of result items change when "our team" changes; fall back to the first post that needs attention.
    selectedKey.value = (next.items.find(needsWork) ?? next.items.find(item => item.status === 'ready') ?? next.items[0])?.key ?? null
  }
  await loadPreviews()
}
async function loadPreviews() {
  try {
    const list = await api.matches.getPackagePreviews(matchId, pkg.value?.trackedTeamId)
    const { getTemplate } = await import('~~/src/templates/index.js')
    const nextTemplates = new Map(templates.value)
    for (const preview of list) {
      const key = templateKey(preview)
      if (!nextTemplates.has(key)) {
        const template = getTemplate(preview.templateId, preview.templateVersion) as PosterTemplate | null
        if (template) nextTemplates.set(key, template)
      }
    }
    templates.value = nextTemplates
    previews.value = new Map(list.map(preview => [preview.key, preview]))
  } catch { previews.value = new Map() }
}
async function load() {
  try { await applyPackage(await api.matches.getPackage(matchId)); error.value = null }
  catch (cause) { error.value = apiError(cause) }
  finally { loading.value = false }
}
async function sync(silent = false) {
  if (syncing.value || document.hidden) return
  syncing.value = true
  try {
    const result = await api.matches.sync(matchId)
    await applyPackage(pkg.value?.trackedTeamId ? await api.matches.getPackage(matchId, pkg.value.trackedTeamId) : result.package)
    if (!silent) toast.add({ title: 'Данные PandaScore обновлены', color: 'success' })
  } catch (cause) { if (!silent) toast.add({ title: 'Синхронизация не выполнена', description: apiError(cause), color: 'error' }) }
  finally { syncing.value = false }
}
async function createItem(item: PublicationPackageItem, forceNewVersion = false) {
  creatingKey.value = item.key
  try {
    const result = await api.matches.createPackage(matchId, { trackedTeamId: pkg.value?.trackedTeamId, keys: [item.key], forceNewVersion })
    await applyPackage(result.package)
    toast.add({ title: forceNewVersion ? 'Создана новая версия публикации' : 'Публикация создана', description: 'Она сохранена в разделе «Публикации» и останется в этом пакете.', color: 'success', icon: 'i-lucide-check' })
  } catch (cause) { toast.add({ title: 'Публикация не создана', description: apiError(cause), color: 'error' }) }
  finally { creatingKey.value = null }
}
async function createAllReady() {
  if (!readyCount.value) return
  creatingKey.value = 'all'
  try {
    const result = await api.matches.createPackage(matchId, { trackedTeamId: pkg.value?.trackedTeamId })
    await applyPackage(result.package)
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
  <UDashboardPanel :ui="{ body: 'p-0 sm:p-0 gap-0 lg:overflow-hidden' }">
    <template #header>
      <AppPageHeader title="Пакет публикаций" description="Посты к матчу: что готово, а что требует доработки">
        <template #actions>
          <UButton :to="`/matches/${matchId}`" label="Матч" icon="i-lucide-swords" color="neutral" variant="ghost" class="hidden sm:inline-flex" />
          <UButton label="Обновить данные" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="syncing" @click="sync()" />
          <UButton label="Создать готовые" icon="i-lucide-package-plus" :loading="creatingKey === 'all'" :disabled="!readyCount" @click="createAllReady" />
        </template>
      </AppPageHeader>
    </template>
    <template #body>
      <div v-if="loading" class="p-6"><USkeleton class="h-96" /></div>
      <div v-else-if="error" class="p-6">
        <UAlert color="error" icon="i-lucide-triangle-alert" title="Пакет недоступен" :description="error"><template #actions><UButton label="Повторить" color="error" variant="outline" @click="load" /></template></UAlert>
      </div>
      <div v-else-if="pkg" class="flex min-h-0 flex-1 flex-col lg:flex-row">
        <!-- Left: match summary and the list of posts -->
        <aside class="flex shrink-0 flex-col border-default lg:w-96 lg:overflow-y-auto lg:border-e" aria-label="Посты пакета">
          <div class="space-y-4 border-b border-default p-4">
            <div>
              <div class="text-base font-semibold text-highlighted">{{ pkg.teams[0]?.name }} — {{ pkg.teams[1]?.name }}</div>
              <div class="mt-0.5 text-sm text-muted">{{ pkg.match.tournament }} · {{ pkg.match.format }} · {{ pkg.match.scoreA ?? 0 }}:{{ pkg.match.scoreB ?? 0 }}</div>
              <div class="mt-1 text-xs text-dimmed">Обновлено <time :datetime="pkg.source.syncedAt">{{ new Date(pkg.source.syncedAt).toLocaleString('ru') }}</time></div>
            </div>
            <UFormField label="Наша команда" description="Нужна для результатов карт и серии">
              <USelect v-model="trackedTeamId" :items="teamOptions" value-key="value" placeholder="Выберите команду" class="w-full" aria-label="Наша команда" />
            </UFormField>
            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="rounded-lg bg-elevated/60 p-2"><div class="text-lg font-semibold text-primary tabular-nums">{{ createdItems.length }}</div><div class="text-[11px] text-muted">Создано</div></div>
              <div class="rounded-lg bg-elevated/60 p-2"><div class="text-lg font-semibold text-success tabular-nums">{{ readyCount }}</div><div class="text-[11px] text-muted">Готово</div></div>
              <div class="rounded-lg bg-elevated/60 p-2"><div class="text-lg font-semibold text-warning tabular-nums">{{ workCount }}</div><div class="text-[11px] text-muted">Доработать</div></div>
              <div class="rounded-lg bg-elevated/60 p-2"><div class="text-lg font-semibold text-muted tabular-nums">{{ waitingCount }}</div><div class="text-[11px] text-muted">Ожидают</div></div>
            </div>
          </div>
          <nav class="space-y-4 p-3">
            <section v-for="group in groups" :key="group.key">
              <h3 class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ group.title }}</h3>
              <div class="space-y-0.5">
                <PackagePublicationPackageCard v-for="item in group.items" :key="item.key" :item="item" :selected="item.key === selectedKey" @select="selectedKey = item.key" />
              </div>
            </section>
          </nav>
          <div class="mt-auto space-y-3 border-t border-default p-4">
            <UButton label="Экспортировать созданные" icon="i-lucide-download" color="neutral" variant="outline" block :loading="exportingKey === 'all'" :disabled="!createdItems.length" @click="exportPackage" />
            <details v-if="statGames.length" class="group">
              <summary class="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-highlighted">
                Статистика карт <UBadge label="OpenDota" color="neutral" variant="subtle" size="sm" />
              </summary>
              <div class="mt-3 space-y-3">
                <div v-for="game in statGames" :key="game.id" class="rounded-lg border border-default">
                  <div class="flex items-center justify-between gap-3 border-b border-default px-3 py-2 text-sm">
                    <span class="font-medium text-highlighted">Карта №{{ game.mapNumber }}</span>
                    <span class="text-muted tabular-nums">{{ game.stats?.radiantScore ?? '—' }}:{{ game.stats?.direScore ?? '—' }} · {{ duration(game.stats?.duration) }}</span>
                  </div>
                  <ul v-if="statPlayers(game).length" class="divide-y divide-default text-xs">
                    <li v-for="(player, index) in statPlayers(game)" :key="`${game.id}-${index}`" class="flex justify-between gap-2 px-3 py-1.5">
                      <span class="truncate text-highlighted">{{ player.name || 'Не указан' }}</span>
                      <span class="shrink-0 tabular-nums text-muted">{{ player.kills ?? '—' }}/{{ player.deaths ?? '—' }}/{{ player.assists ?? '—' }} · {{ player.netWorth ?? '—' }}</span>
                    </li>
                  </ul>
                  <p v-else class="px-3 py-2 text-xs text-muted">OpenDota передала драфт и итог карты без статистики игроков.</p>
                </div>
              </div>
            </details>
          </div>
        </aside>

        <!-- Right: the selected post with its layout preview -->
        <section v-if="selected && selectedMeta" class="flex min-h-[32rem] min-w-0 flex-1 flex-col" aria-live="polite">
          <div class="flex flex-wrap items-start gap-3 border-b border-default p-4">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold text-highlighted">{{ selected.title }}</h2>
                <UBadge :label="selectedMeta.label" :color="selectedMeta.color" :icon="selectedMeta.icon" variant="subtle" />
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ selected.reason || (selected.status === 'created' ? 'Публикация сохранена — откройте её в редакторе или экспортируйте.' : 'Данных достаточно — можно создать публикацию.') }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="selected.kind === 'draft' && selected.status !== 'created'" :label="selected.status === 'requires_input' ? 'Заполнить драфт' : 'Изменить драфт'" icon="i-lucide-list-plus" color="neutral" variant="outline" @click="editDraft(selected)" />
              <template v-if="selected.status === 'created'">
                <UButton label="Новая версия" icon="i-lucide-copy-plus" color="neutral" variant="ghost" :loading="creatingKey === selected.key" @click="createItem(selected, true)" />
                <UButton label="Экспорт PNG" icon="i-lucide-download" color="neutral" variant="outline" :loading="exportingKey === selected.key" @click="exportItem(selected)" />
                <UButton label="Открыть в редакторе" icon="i-lucide-square-pen" @click="navigateTo(`/editor/${selected.projectId}`)" />
              </template>
              <UButton v-else label="Создать публикацию" icon="i-lucide-image-plus" :loading="creatingKey === selected.key" :disabled="selected.status !== 'ready'" @click="createItem(selected)" />
            </div>
          </div>
          <div class="relative flex min-h-0 flex-1 flex-col">
            <UBadge v-if="selectedPreview && selectedTemplate" class="absolute left-4 top-4 z-10" :label="selectedPreview.source === 'project' ? 'Сохранённая публикация' : 'Предпросмотр по данным матча'" :color="selectedPreview.source === 'project' ? 'primary' : 'neutral'" variant="subtle" />
            <EditorPosterPreview v-if="selectedPreview && selectedTemplate" :key="selected.key" :template="selectedTemplate" :data="selectedPreview.data" :style="selectedPreview.style" />
            <div v-else class="df-grid grid flex-1 place-items-center bg-muted p-8 text-center">
              <div class="max-w-sm">
                <UIcon :name="selectedMeta.icon" class="mx-auto size-10 text-dimmed" />
                <p class="mt-3 font-medium text-highlighted">Макет пока не собрать</p>
                <p class="mt-1 text-sm text-muted">{{ selected.reason || 'Недостаточно данных матча для этого шаблона.' }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
