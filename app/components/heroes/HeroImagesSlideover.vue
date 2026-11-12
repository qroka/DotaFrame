<!-- @level L2-Controller -->
<script setup lang="ts">
import type { HeroImage } from '~/types/dotaframe'
import type { Hero } from '~~/src/types'
import { ATTRIBUTES } from '~~/src/data/heroes'
import { api, apiError } from '~/services/api'
import { measureTransparency } from '~/utils/images'

const props = defineProps<{ hero: Hero | null }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const { byHero, refresh } = useHeroImages()
const images = computed(() => props.hero ? byHero.value.get(props.hero.id) ?? [] : [])
const uploading = shallowRef(false)
const dragging = shallowRef(false)
const confirmOpen = shallowRef(false)
const pendingDelete = shallowRef<HeroImage | null>(null)
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

async function addFiles(list: FileList | File[] | null | undefined) {
  const hero = props.hero
  const files = [...(list ?? [])]
  if (!hero || !files.length) return
  uploading.value = true
  let added = 0
  let opaque = 0
  const failed: string[] = []
  for (const file of files) {
    try {
      const hasAlpha = await measureTransparency(file)
      const asset = await api.upload(file, 'hero-image')
      const saved = await api.heroImages.save({ heroId: hero.id, assetId: asset.id, title: file.name.replace(/\.[^.]+$/, '').slice(0, 80), hasAlpha })
      added++
      if (saved.hasAlpha === false) opaque++
    } catch (cause) { failed.push(`${file.name}: ${apiError(cause)}`) }
  }
  try { await refresh() } finally { uploading.value = false }
  if (added) toast.add({ title: added === 1 ? 'Изображение добавлено' : `Добавлено изображений: ${added}`, color: 'success', icon: 'i-lucide-check' })
  if (opaque) toast.add({ title: opaque === 1 ? 'У изображения нет прозрачного фона' : `Без прозрачного фона: ${opaque}`, description: 'В публикации оно закроет фон прямоугольником. Лучше PNG с прозрачным фоном.', color: 'warning' })
  if (failed.length) toast.add({ title: 'Не все файлы загружены', description: failed.join('\n'), color: 'error' })
}
function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  return addFiles(files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  return addFiles(event.dataTransfer?.files)
}
async function rename(image: HeroImage, value: string) {
  const title = value.trim().slice(0, 80)
  if (title === image.title) return
  try {
    await api.heroImages.save({ id: image.id, heroId: image.heroId, assetId: image.assetId, title })
    await refresh()
  } catch (cause) { toast.add({ title: 'Не удалось переименовать', description: apiError(cause), color: 'error' }) }
}
function askDelete(image: HeroImage) { pendingDelete.value = image; confirmOpen.value = true }
async function removeImage() {
  if (!pendingDelete.value) return
  try {
    await api.heroImages.remove(pendingDelete.value.id)
    await refresh()
    confirmOpen.value = false
    toast.add({ title: 'Изображение удалено из героя', description: 'Публикации, где оно уже использовано, не изменились.', color: 'success' })
  } catch (cause) { toast.add({ title: 'Не удалось удалить изображение', description: apiError(cause), color: 'error' }) }
}
</script>

<template>
  <USlideover v-model:open="open" :title="hero?.name ?? 'Герой'" description="Свои изображения персонажа для слоя «Игрок / персонаж» в публикациях." :ui="{ content: 'sm:max-w-xl' }">
    <template #body>
      <div v-if="hero" class="space-y-5">
        <div class="flex items-center gap-4">
          <div class="aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-elevated ring ring-default"><HeroesHeroPortrait :hero="hero" /></div>
          <div class="min-w-0">
            <div class="flex items-center gap-2"><span class="size-2.5 rounded-full" :style="{ background: ATTRIBUTES[hero.attr].color }" /><span class="text-sm text-muted">{{ ATTRIBUTES[hero.attr].label }}</span></div>
            <p class="mt-1 text-xs text-dimmed">Слева — стандартная иконка героя. Она используется в драфтах и не заменяется.</p>
          </div>
        </div>

        <div
          class="rounded-lg border-2 border-dashed p-4 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-default'"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-image-plus" class="mx-auto size-7 text-dimmed" />
          <p class="mt-2 text-sm text-highlighted">Перетащите изображения сюда</p>
          <p class="mt-0.5 text-xs text-muted">Лучше PNG с прозрачным фоном. PNG, JPEG, WebP, GIF или SVG до 12 МБ.</p>
          <UButton as="label" class="mt-3 cursor-pointer" color="neutral" variant="outline" icon="i-lucide-upload" label="Выбрать файлы" :loading="uploading">
            <input type="file" multiple :accept="ACCEPT" class="sr-only" data-testid="hero-image-input" @change="onPick">
          </UButton>
        </div>

        <div>
          <h3 class="mb-2 text-sm font-semibold text-highlighted">Изображения <span class="font-normal text-muted">· {{ images.length }}</span></h3>
          <p v-if="!images.length" class="rounded-lg bg-elevated/50 p-4 text-center text-sm text-muted">Пока нет изображений — добавьте первое.</p>
          <ul v-else class="grid grid-cols-2 gap-3" data-testid="hero-image-list">
            <li v-for="image in images" :key="image.id" class="overflow-hidden rounded-lg bg-default ring ring-default">
              <div class="df-checker relative grid aspect-[4/5] place-items-center">
                <img :src="`/api/media/${image.assetId}`" :alt="image.title || `Изображение ${hero.name}`" loading="lazy" decoding="async" class="max-h-full max-w-full object-contain">
                <UBadge v-if="image.hasAlpha === false" label="Без прозрачности" icon="i-lucide-triangle-alert" color="warning" variant="subtle" size="sm" class="absolute left-2 top-2" />
                <UBadge v-else-if="image.hasAlpha" label="Фон прозрачный" icon="i-lucide-check" color="success" variant="subtle" size="sm" class="absolute left-2 top-2" />
              </div>
              <div class="flex items-center gap-1 p-2">
                <UInput :model-value="image.title" placeholder="Название" size="sm" class="min-w-0 flex-1" :aria-label="`Название изображения ${image.title}`" :maxlength="80" @change="rename(image, ($event.target as HTMLInputElement).value)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :aria-label="`Удалить ${image.title || 'изображение'}`" @click="askDelete(image)" />
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </USlideover>
  <UModal v-model:open="confirmOpen" title="Удалить изображение?" :description="pendingDelete ? `«${pendingDelete.title || 'Без названия'}» будет убрано из героя. Созданные публикации с этим изображением не изменятся.` : ''">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" icon="i-lucide-trash-2" @click="removeImage" /></div></template>
  </UModal>
</template>
