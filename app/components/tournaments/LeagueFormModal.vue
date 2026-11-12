<!-- @level L2-Controller -->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { League } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'

const props = defineProps<{ league?: League | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const saving = shallowRef(false)
const uploadingLogo = shallowRef(false)
const logoAssetId = shallowRef<string | null>(null)
const logoUrl = shallowRef<string | null>(null)
const schema = z.object({ name: z.string().trim().min(1, 'Введите название').max(80), notes: z.string().trim().max(500) })
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ name: '', notes: '' })

watch(() => [open.value, props.league] as const, ([isOpen, league]) => {
  if (!isOpen) return
  Object.assign(state, { name: league?.name ?? '', notes: league?.notes ?? '' })
  logoAssetId.value = league?.logoAssetId ?? null
  logoUrl.value = logoAssetId.value ? `/api/media/${logoAssetId.value}` : null
}, { immediate: true })

async function uploadLogo(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try {
    const asset = await api.upload(file, 'league-logo')
    logoAssetId.value = asset.id
    logoUrl.value = asset.url
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить логотип', description: apiError(cause), color: 'error' })
  } finally { uploadingLogo.value = false; input.value = '' }
}

async function save(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    await api.leagues.save({ ...props.league, ...event.data, logoAssetId: logoAssetId.value })
    toast.add({ title: props.league ? 'Лига обновлена' : 'Лига добавлена', color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('saved')
  } catch (cause) {
    toast.add({ title: 'Не удалось сохранить лигу', description: apiError(cause), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="league ? 'Изменить лигу' : 'Новая лига'" description="Бренд или организатор, под которым проходят серии турниров.">
    <template #body>
      <UForm id="league-form" :schema="schema" :state="state" class="space-y-4" @submit="save">
        <UFormField name="name" label="Название" required><UInput v-model="state.name" class="w-full" autofocus /></UFormField>
        <UFormField name="notes" label="Заметки"><UTextarea v-model="state.notes" class="w-full" autoresize :maxrows="5" /></UFormField>
        <UFormField label="Логотип" description="PNG, JPEG, WebP, GIF или SVG">
          <div class="flex items-center gap-3">
            <div class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated ring ring-default">
              <img v-if="logoUrl" :src="logoUrl" alt="Предпросмотр логотипа" class="size-full object-contain p-1">
              <UIcon v-else name="i-lucide-flag" class="size-6 text-dimmed" />
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
        <UButton type="submit" form="league-form" :loading="saving" :label="league ? 'Сохранить' : 'Добавить лигу'" />
      </div>
    </template>
  </UModal>
</template>
