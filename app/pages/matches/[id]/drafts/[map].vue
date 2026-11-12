<!-- @level L0-Page -->
<script setup lang="ts">
import { api, apiError } from '~/services/api'
import type { Match, Team } from '~/types/dotaframe'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Ручной драфт' })
const route = useRoute()
const matchId = String(route.params.id)
const mapNumber = Number(route.params.map || 1)
const toast = useToast()
const loading = shallowRef(true)
const saving = shallowRef(false)
const match = shallowRef<Match | null>(null)
const teams = shallowRef<Team[]>([])
const heroOptions = shallowRef<Array<{ label: string, value: number }>>([])
const draft = reactive({
  id: null as string | null, matchId, mapNumber, radiantTeamId: '', direTeamId: '',
  picksRadiant: [null, null, null, null, null] as Array<number | null>,
  picksDire: [null, null, null, null, null] as Array<number | null>,
  bansRadiant: [] as number[], bansDire: [] as number[], winner: null as 'radiant' | 'dire' | null
})
const selectedHeroes = computed(() => [...draft.picksRadiant, ...draft.picksDire].filter((value): value is number => value !== null))
const allHeroes = computed(() => [...selectedHeroes.value, ...draft.bansRadiant, ...draft.bansDire])
const valid = computed(() => selectedHeroes.value.length === 10 && new Set(allHeroes.value).size === allHeroes.value.length && draft.bansRadiant.length <= 10 && draft.bansDire.length <= 10 && draft.radiantTeamId !== draft.direTeamId)
const teamOptions = computed(() => teams.value.filter(team => team.id === match.value?.teamAId || team.id === match.value?.teamBId).map(team => ({ label: team.name, value: team.id })))
function sideTeam(side: string) { return side === 'Radiant' ? draft.radiantTeamId : draft.direTeamId }
function setSideTeam(side: string, value: unknown) { if (side === 'Radiant') draft.radiantTeamId = String(value); else draft.direTeamId = String(value) }
function sidePick(side: string, index: number) { return (side === 'Radiant' ? draft.picksRadiant : draft.picksDire)[index] ?? undefined }
function setSidePick(side: string, index: number, value: unknown) { (side === 'Radiant' ? draft.picksRadiant : draft.picksDire)[index] = value == null ? null : Number(value) }
function sideBans(side: string) { return side === 'Radiant' ? draft.bansRadiant : draft.bansDire }
function setSideBans(side: string, value: unknown) {
  const bans = Array.isArray(value) ? value.map(Number).slice(0, 10) : []
  if (side === 'Radiant') draft.bansRadiant = bans; else draft.bansDire = bans
}

onMounted(async () => {
  try {
    const [matchValue, bootstrap, stored, heroes] = await Promise.all([api.matches.get(matchId), api.bootstrap(), api.drafts.find(matchId, mapNumber), import('~~/src/data/heroes')])
    match.value = matchValue; teams.value = bootstrap.teams
    heroOptions.value = heroes.HEROES.map((hero: any) => ({ label: hero.name, value: hero.id }))
    Object.assign(draft, stored || { radiantTeamId: matchValue.teamAId, direTeamId: matchValue.teamBId })
  } catch (cause) { toast.add({ title: 'Не удалось открыть драфт', description: apiError(cause), color: 'error' }) }
  finally { loading.value = false }
})
async function save() {
  if (!valid.value) return
  saving.value = true
  try {
    await api.drafts.save(structuredClone(draft))
    toast.add({ title: 'Драфт сохранён', color: 'success' })
    await navigateTo(`/matches/${matchId}/package`)
  } catch (cause) { toast.add({ title: 'Драфт не сохранён', description: apiError(cause), color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <UDashboardPanel>
    <template #header><AppPageHeader :title="`Драфт карты №${mapNumber}`" description="Пики и баны заполняются вручную"><template #actions><UButton :to="`/matches/${matchId}/package`" label="К пакету" icon="i-lucide-arrow-left" color="neutral" variant="outline" /><UButton label="Сохранить драфт" icon="i-lucide-save" :loading="saving" :disabled="!valid" @click="save" /></template></AppPageHeader></template>
    <template #body>
      <UContainer class="max-w-5xl py-6">
        <USkeleton v-if="loading" class="h-96" />
        <template v-else>
          <UAlert class="mb-5" color="info" variant="subtle" icon="i-lucide-info" title="PandaScore не передаёт пики и баны" description="Текущий тариф возвращает только статус и победителя карты. Выберите героев по фактическому драфту." />
          <div class="grid gap-5 lg:grid-cols-2">
            <UCard v-for="side in ['Radiant', 'Dire']" :key="side">
              <div class="mb-4 flex items-center justify-between gap-3"><h2 class="font-semibold text-highlighted">{{ side }}</h2><USelect :model-value="sideTeam(side)" :items="teamOptions" value-key="value" class="w-52" @update:model-value="setSideTeam(side, $event)" /></div>
              <div class="space-y-3">
                <UFormField v-for="index in 5" :key="index" :label="`Пик ${index}`">
                  <USelectMenu :model-value="sidePick(side, index - 1)" :items="heroOptions" value-key="value" searchable class="w-full" placeholder="Выберите героя" @update:model-value="setSidePick(side, index - 1, $event)" />
                </UFormField>
                <UFormField label="Баны" description="До 10 героев в порядке драфта">
                  <USelectMenu :model-value="sideBans(side)" :items="heroOptions" value-key="value" multiple searchable class="w-full" placeholder="Добавьте забаненных героев" @update:model-value="setSideBans(side, $event)" />
                </UFormField>
              </div>
            </UCard>
          </div>
          <UAlert v-if="selectedHeroes.length === 10 && !valid" class="mt-5" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Проверьте драфт" description="Каждый герой должен быть выбран один раз, а стороны должны принадлежать разным командам." />
        </template>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
