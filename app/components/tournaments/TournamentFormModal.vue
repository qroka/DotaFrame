<!-- @level L2-Controller -->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Tournament } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const props = defineProps<{ tournament?: Tournament | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const saving = shallowRef(false)
const uploadingLogo = shallowRef(false)
const logoAssetId = shallowRef<string | null>(null)
const logoUrl = shallowRef<string | null>(null)
const tierItems = [
  { label: 'Не указан', value: 'none' }, { label: 'S — премьер', value: 'S' }, { label: 'A', value: 'A' },
  { label: 'B', value: 'B' }, { label: 'C', value: 'C' }, { label: 'D', value: 'D' }
]
const schema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(120),
  league: z.string().trim().max(80),
  tier: z.enum(['none', 'S', 'A', 'B', 'C', 'D']),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string().trim().max(500)
}).refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: 'Окончание раньше начала', path: ['endDate'] })
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ name: '', league: '', tier: 'none', startDate: '', endDate: '', notes: '' })

watch(() => [open.value, props.tournament] as const, ([isOpen, tournament]) => {
  if (!isOpen) return
  Object.assign(state, {
    name: tournament?.name ?? '', league: tournament?.league ?? '', tier: tournament?.tier || 'none',
    startDate: tournament?.startDate ?? '', endDate: tournament?.endDate ?? '', notes: tournament?.notes ?? ''
  })
  logoAssetId.value = tournament?.logoAssetId ?? null
  logoUrl.value = logoAssetId.value ? `/api/media/${logoAssetId.value}` : null
}, { immediate: true })

async function uploadLogo(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try {
    const asset = await api.upload(file, 'tournament-logo')
    logoAssetId.value = asset.id
    logoUrl.value = asset.url
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить логотип', description: apiError(cause), color: 'error' })
  } finally { uploadingLogo.value = false; input.value = '' }
}

async function save(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const { tier, startDate, endDate, ...rest } = event.data
    await api.tournaments.save({
      ...props.tournament, ...rest, tier: tier === 'none' ? '' : tier,
      startDate: startDate || null, endDate: endDate || null, logoAssetId: logoAssetId.value
    })
    toast.add({ title: props.tournament ? 'Турнир обновлён' : 'Турнир добавлен', color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('saved')
  } catch (cause) {
    toast.add({ title: 'Не удалось сохранить турнир', description: apiError(cause), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="tournament ? 'Изменить турнир' : 'Новый турнир'" description="Название, сроки и логотип турнира для матчей и публикаций.">
    <template #body>
      <UForm id="tournament-form" :schema="schema" :state="state" class="space-y-4" @submit="save">
        <UFormField name="name" label="Название" required><UInput v-model="state.name" class="w-full" autofocus /></UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="league" label="Лига / организатор"><UInput v-model="state.league" class="w-full" /></UFormField>
          <UFormField name="tier" label="Уровень"><USelect v-model="state.tier" :items="tierItems" class="w-full" /></UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="startDate" label="Начало"><UInput v-model="state.startDate" type="date" class="w-full" /></UFormField>
          <UFormField name="endDate" label="Окончание"><UInput v-model="state.endDate" type="date" class="w-full" /></UFormField>
        </div>
        <UFormField name="notes" label="Заметки"><UTextarea v-model="state.notes" class="w-full" autoresize :maxrows="5" /></UFormField>
        <UFormField label="Логотип" description="PNG, JPEG, WebP, GIF или SVG">
          <div class="flex items-center gap-3">
            <div class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated ring ring-default">
              <img v-if="logoUrl" :src="logoUrl" alt="Предпросмотр логотипа" class="size-full object-contain p-1">
              <UIcon v-else name="i-lucide-trophy" class="size-6 text-dimmed" />
            </div>
            <UButton as="label" class="cursor-pointer" color="neutral" variant="outline" icon="i-lucide-upload" label="Выбрать файл" :loading="uploadingLogo">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" class="sr-only" @change="uploadLogo">
            </UButton>
            <UButton v-if="logoAssetId" label="Убрать" color="neutral" variant="ghost" @click="logoAssetId = null; logoUrl = null" />
          </div>
        </UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="outline" @click="close" />
        <UButton type="submit" form="tournament-form" :loading="saving" :label="tournament ? 'Сохранить' : 'Добавить турнир'" />
      </div>
    </template>
  </UModal>
</template>
