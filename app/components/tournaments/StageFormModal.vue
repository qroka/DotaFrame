<!-- @level L2-Controller -->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Stage } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const props = defineProps<{ stage?: Stage | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const { tournaments } = useDotaFrameDb()
const toast = useToast()
const saving = shallowRef(false)
const tierItems = [
  { label: 'Не указан', value: 'none' }, { label: 'S — премьер', value: 'S' }, { label: 'A', value: 'A' },
  { label: 'B', value: 'B' }, { label: 'C', value: 'C' }, { label: 'D', value: 'D' }
]
const seriesItems = computed(() => [{ label: 'Без серии', value: 'none' }, ...tournaments.value.map(item => ({ label: item.name, value: item.id }))])
const schema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(120),
  seriesId: z.string(),
  tier: z.enum(['none', 'S', 'A', 'B', 'C', 'D']),
  startDate: z.string(),
  endDate: z.string(),
  prizePool: z.string().trim().max(80),
  notes: z.string().trim().max(500)
}).refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: 'Окончание раньше начала', path: ['endDate'] })
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ name: '', seriesId: 'none', tier: 'none', startDate: '', endDate: '', prizePool: '', notes: '' })

watch(() => [open.value, props.stage] as const, ([isOpen, stage]) => {
  if (!isOpen) return
  Object.assign(state, {
    name: stage?.name ?? '', seriesId: stage?.seriesId ?? 'none', tier: stage?.tier || 'none',
    startDate: stage?.startDate ?? '', endDate: stage?.endDate ?? '', prizePool: stage?.prizePool ?? '', notes: stage?.notes ?? ''
  })
}, { immediate: true })

async function save(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const { tier, seriesId, startDate, endDate, ...rest } = event.data
    await api.stages.save({
      ...props.stage, ...rest, tier: tier === 'none' ? '' : tier, seriesId: seriesId === 'none' ? null : seriesId,
      startDate: startDate || null, endDate: endDate || null
    })
    toast.add({ title: props.stage ? 'Турнир обновлён' : 'Турнир добавлен', color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('saved')
  } catch (cause) {
    toast.add({ title: 'Не удалось сохранить турнир', description: apiError(cause), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="stage ? 'Изменить турнир' : 'Новый турнир'" description="Этап серии: групповой этап, плей-офф, квалификация.">
    <template #body>
      <UForm id="stage-form" :schema="schema" :state="state" class="space-y-4" @submit="save">
        <UFormField name="name" label="Название" required><UInput v-model="state.name" class="w-full" autofocus /></UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="seriesId" label="Серия"><USelect v-model="state.seriesId" :items="seriesItems" class="w-full" /></UFormField>
          <UFormField name="tier" label="Уровень"><USelect v-model="state.tier" :items="tierItems" class="w-full" /></UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="startDate" label="Начало"><UInput v-model="state.startDate" type="date" class="w-full" /></UFormField>
          <UFormField name="endDate" label="Окончание"><UInput v-model="state.endDate" type="date" class="w-full" /></UFormField>
        </div>
        <UFormField name="prizePool" label="Призовой фонд"><UInput v-model="state.prizePool" class="w-full" placeholder="например, 1 000 000 United States Dollar" /></UFormField>
        <UFormField name="notes" label="Заметки"><UTextarea v-model="state.notes" class="w-full" autoresize :maxrows="5" /></UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="outline" @click="close" />
        <UButton type="submit" form="stage-form" :loading="saving" :label="stage ? 'Сохранить' : 'Добавить турнир'" />
      </div>
    </template>
  </UModal>
</template>
