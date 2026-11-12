<!-- @level L2-Controller -->
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Player } from '~/types/dotaframe'
import { api, apiError } from '~/services/api'
import { PLAYER_ROLE_ITEMS } from '~/utils/players'

const props = defineProps<{ player?: Player | null, defaultTeamId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const { teams } = useDotaFrameDb()
const saving = shallowRef(false)
const uploadingPhoto = shallowRef(false)
const photoAssetId = shallowRef<string | null>(null)
const photoUrl = shallowRef<string | null>(null)
const NO_TEAM = 'none'
const teamItems = computed(() => [{ label: 'Без команды', value: NO_TEAM }, ...teams.value.map(team => ({ label: team.name, value: team.id }))])
const schema = z.object({
  nickname: z.string().trim().min(1, 'Введите ник').max(40),
  realName: z.string().trim().max(80),
  teamId: z.string(),
  role: z.enum(['none', '1', '2', '3', '4', '5']),
  country: z.string().trim().max(40),
  notes: z.string().trim().max(500)
})
type Schema = z.output<typeof schema>
const state = reactive<Schema>({ nickname: '', realName: '', teamId: NO_TEAM, role: 'none', country: '', notes: '' })

watch(() => [open.value, props.player] as const, ([isOpen, player]) => {
  if (!isOpen) return
  Object.assign(state, {
    nickname: player?.nickname ?? '', realName: player?.realName ?? '',
    teamId: player ? player.teamId || NO_TEAM : props.defaultTeamId || NO_TEAM,
    role: player?.role || 'none', country: player?.country ?? '', notes: player?.notes ?? ''
  })
  photoAssetId.value = player?.photoAssetId ?? null
  photoUrl.value = photoAssetId.value ? `/api/media/${photoAssetId.value}` : null
}, { immediate: true })

async function uploadPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingPhoto.value = true
  try {
    const asset = await api.upload(file, 'player-photo')
    photoAssetId.value = asset.id
    photoUrl.value = asset.url
  } catch (cause) {
    toast.add({ title: 'Не удалось загрузить фото', description: apiError(cause), color: 'error' })
  } finally { uploadingPhoto.value = false; input.value = '' }
}

async function save(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const { teamId, role, ...rest } = event.data
    await api.players.save({
      ...props.player, ...rest, teamId: teamId === NO_TEAM ? null : teamId,
      role: role === 'none' ? '' : role, photoAssetId: photoAssetId.value
    })
    toast.add({ title: props.player ? 'Игрок обновлён' : 'Игрок добавлен', color: 'success', icon: 'i-lucide-check' })
    open.value = false
    emit('saved')
  } catch (cause) {
    toast.add({ title: 'Не удалось сохранить игрока', description: apiError(cause), color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="player ? 'Изменить игрока' : 'Новый игрок'" description="Ник, команда и позиция игрока для составов и публикаций.">
    <template #body>
      <UForm id="player-form" :schema="schema" :state="state" class="space-y-4" @submit="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="nickname" label="Ник" required><UInput v-model="state.nickname" class="w-full" autofocus /></UFormField>
          <UFormField name="realName" label="Имя и фамилия"><UInput v-model="state.realName" class="w-full" /></UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="teamId" label="Команда"><USelectMenu v-model="state.teamId" :items="teamItems" value-key="value" class="w-full" /></UFormField>
          <UFormField name="role" label="Позиция"><USelect v-model="state.role" :items="PLAYER_ROLE_ITEMS" class="w-full" /></UFormField>
        </div>
        <UFormField name="country" label="Страна" hint="Например, UA или Украина"><UInput v-model="state.country" class="w-full" /></UFormField>
        <UFormField name="notes" label="Заметки"><UTextarea v-model="state.notes" class="w-full" autoresize :maxrows="5" /></UFormField>
        <UFormField label="Фото" description="PNG, JPEG, WebP, GIF или SVG">
          <div class="flex items-center gap-3">
            <div class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated ring ring-default">
              <img v-if="photoUrl" :src="photoUrl" alt="Предпросмотр фото" class="size-full object-cover">
              <UIcon v-else name="i-lucide-user" class="size-6 text-dimmed" />
            </div>
            <UButton as="label" class="cursor-pointer" color="neutral" variant="outline" icon="i-lucide-upload" label="Выбрать файл" :loading="uploadingPhoto">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" class="sr-only" @change="uploadPhoto">
            </UButton>
            <UButton v-if="photoAssetId" label="Убрать" color="neutral" variant="ghost" @click="photoAssetId = null; photoUrl = null" />
          </div>
        </UFormField>
      </UForm>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="outline" @click="close" />
        <UButton type="submit" form="player-form" :loading="saving" :label="player ? 'Сохранить' : 'Добавить игрока'" />
      </div>
    </template>
  </UModal>
</template>
