<!-- @level L1-Feature -->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Match } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const props = defineProps<{ matchId?: string }>()
const { teams, tournaments, initialize, refresh } = useDotaFrameDb()
const toast = useToast()
const loading = shallowRef(true)
const saving = shallowRef(false)
const record = shallowRef<Match | null>(null)
const state = reactive({
  teamAId: '', teamBId: '', tournament: '', stage: '', startDate: '', startTime: '',
  timezone: 'Europe/Moscow', format: 'BO3', status: 'scheduled', scoreA: null as number | null,
  scoreB: null as number | null, notes: ''
})
const schema = z.object({
  teamAId: z.string().min(1, 'Выберите первую команду'),
  teamBId: z.string().min(1, 'Выберите вторую команду'),
  tournament: z.string().trim().min(1, 'Введите турнир').max(100),
  stage: z.string().trim().max(80), startDate: z.string().min(1, 'Укажите дату'),
  startTime: z.string().min(1, 'Укажите время'), timezone: z.string(), format: z.string(),
  status: z.string(), scoreA: z.number().nullable(), scoreB: z.number().nullable(), notes: z.string().max(1000)
}).refine(data => data.teamAId !== data.teamBId, { path: ['teamBId'], message: 'Выберите другую команду' })
const teamOptions = computed(() => teams.value.map(team => ({ label: team.name, value: team.id })))
const formats = ['BO1', 'BO2', 'BO3', 'BO5']
const statuses = [
  { label: 'Запланирован', value: 'scheduled' }, { label: 'Идёт сейчас', value: 'live' },
  { label: 'Завершён', value: 'completed' }, { label: 'Отменён', value: 'cancelled' }
]
const timezoneOptions = [
  { label: 'Москва (UTC+3)', value: 'Europe/Moscow' }, { label: 'Екатеринбург (UTC+5)', value: 'Asia/Yekaterinburg' },
  { label: 'UTC', value: 'UTC' }, { label: 'Берлин', value: 'Europe/Berlin' }, { label: 'Нью-Йорк', value: 'America/New_York' }
]
const scoreVisible = computed(() => state.status === 'live' || state.status === 'completed')

onMounted(async () => {
  try {
    await initialize()
    record.value = props.matchId ? await api.matches.get(props.matchId) : null
    Object.assign(state, { teamAId: '', teamBId: '', tournament: '', stage: '', startDate: '', startTime: '', timezone: 'Europe/Moscow', format: 'BO3', status: 'scheduled', scoreA: null, scoreB: null, notes: '' }, record.value ?? {})
  } finally { loading.value = false }
})

async function submit(event: FormSubmitEvent<any>) {
  saving.value = true
  try {
    const saved = await api.matches.save({ ...record.value, ...event.data })
    await refresh()
    toast.add({ title: record.value ? 'Матч обновлён' : 'Матч добавлен', color: 'success', icon: 'i-lucide-check' })
    await navigateTo(`/matches/${saved.id}`)
  } catch (cause: any) {
    toast.add({ title: 'Не удалось сохранить матч', description: apiError(cause), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <USkeleton v-if="loading" class="h-[36rem] w-full" />
  <UForm v-else :schema="schema" :state="state" class="space-y-8" @submit="submit">
    <section>
      <h2 class="text-base font-semibold text-highlighted">Участники</h2>
      <p class="mb-4 mt-1 text-sm text-muted">Команды нельзя менять местами после создания публикаций — исторические снимки останутся прежними.</p>
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField name="teamAId" label="Команда A" required><USelectMenu v-model="state.teamAId" value-key="value" :items="teamOptions" searchable class="w-full" /></UFormField>
        <UFormField name="teamBId" label="Команда B" required><USelectMenu v-model="state.teamBId" value-key="value" :items="teamOptions" searchable class="w-full" /></UFormField>
      </div>
    </section>
    <USeparator />
    <section>
      <h2 class="mb-4 text-base font-semibold text-highlighted">Турнир и расписание</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField name="tournament" label="Турнир" required><UInput v-model="state.tournament" class="w-full" list="match-tournament-options" autocomplete="off" /><datalist id="match-tournament-options"><option v-for="item in tournaments" :key="item.id" :value="item.name" /></datalist></UFormField>
        <UFormField name="stage" label="Стадия"><UInput v-model="state.stage" class="w-full" placeholder="Групповой этап" /></UFormField>
        <UFormField name="startDate" label="Дата" required><UInput v-model="state.startDate" type="date" class="w-full" /></UFormField>
        <UFormField name="startTime" label="Время" required><UInput v-model="state.startTime" type="time" class="w-full" /></UFormField>
        <UFormField name="timezone" label="Часовой пояс"><USelect v-model="state.timezone" value-key="value" :items="timezoneOptions" class="w-full" /></UFormField>
        <UFormField name="format" label="Формат"><USelect v-model="state.format" :items="formats" class="w-full" /></UFormField>
      </div>
    </section>
    <USeparator />
    <section>
      <h2 class="mb-4 text-base font-semibold text-highlighted">Статус и результат</h2>
      <div class="grid gap-4 md:grid-cols-3">
        <UFormField name="status" label="Статус"><USelect v-model="state.status" value-key="value" :items="statuses" class="w-full" /></UFormField>
        <template v-if="scoreVisible">
          <UFormField name="scoreA" label="Счёт команды A"><UInputNumber v-model="state.scoreA" :min="0" :max="5" class="w-full" /></UFormField>
          <UFormField name="scoreB" label="Счёт команды B"><UInputNumber v-model="state.scoreB" :min="0" :max="5" class="w-full" /></UFormField>
        </template>
      </div>
      <UFormField name="notes" label="Заметки" class="mt-4"><UTextarea v-model="state.notes" class="w-full" autoresize :maxrows="5" /></UFormField>
    </section>
    <div class="flex justify-end gap-2 border-t border-default pt-5">
      <UButton to="/matches" label="Отмена" color="neutral" variant="outline" />
      <UButton type="submit" :loading="saving" :label="record ? 'Сохранить изменения' : 'Добавить матч'" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
