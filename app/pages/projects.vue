<!-- @level L0-Page -->
<script setup lang="ts">
import type { PosterProject } from '~/types/dotaframe'
import { api } from '~/services/api'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Публикации' })
const { projects, loading, refresh } = useDotaFrameDb()
const toast = useToast()
const query = shallowRef('')
const deleteOpen = shallowRef(false)
const pendingDelete = shallowRef<PosterProject | null>(null)
const filtered = computed(() => {
  const needle = query.value.toLocaleLowerCase('ru')
  return needle ? projects.value.filter(project => project.title.toLocaleLowerCase('ru').includes(needle)) : projects.value
})
function askDelete(project: PosterProject) { pendingDelete.value = project; deleteOpen.value = true }
async function duplicate(project: PosterProject) {
  const copy = await api.projects.duplicate(project.id!)
  await refresh()
  toast.add({ title: 'Создана копия', color: 'success' })
  await navigateTo(`/editor/${copy.id}`)
}
async function removeProject() {
  if (!pendingDelete.value?.id) return
  await api.projects.remove(pendingDelete.value.id)
  deleteOpen.value = false
  toast.add({ title: 'Публикация удалена', color: 'success' })
  await refresh()
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <AppPageHeader title="Публикации" description="Сохранённые макеты и их неизменяемая история">
        <template #actions><UButton to="/templates" label="Новая публикация" icon="i-lucide-plus" /></template>
      </AppPageHeader>
      <UDashboardToolbar><template #left><UInput v-model="query" icon="i-lucide-search" placeholder="Найти публикацию…" class="w-full sm:w-72" /></template></UDashboardToolbar>
    </template>
    <template #body>
      <USkeleton v-if="loading" class="h-80 w-full" />
      <div v-else-if="filtered.length" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="project in filtered" :key="project.id || project.title" class="group overflow-hidden" :ui="{ body: 'p-0 sm:p-0' }">
          <NuxtLink :to="`/editor/${project.id}`" class="df-grid grid aspect-[16/9] place-items-center bg-elevated">
            <div class="text-center"><UIcon name="i-lucide-image" class="mx-auto size-9 text-dimmed" /><UBadge class="mt-3" :label="project.templateId" color="neutral" variant="subtle" /></div>
          </NuxtLink>
          <div class="flex items-start gap-3 p-4">
            <div class="min-w-0 flex-1"><NuxtLink :to="`/editor/${project.id}`" class="line-clamp-2 font-semibold text-highlighted hover:text-primary">{{ project.title }}</NuxtLink><p class="mt-1 text-xs text-muted">{{ project.updatedAt ? new Date(project.updatedAt).toLocaleString('ru') : 'Черновик' }}</p></div>
            <UDropdownMenu :items="[[{ label: 'Открыть', icon: 'i-lucide-pencil', onSelect: () => navigateTo(`/editor/${project.id}`) }, { label: 'Создать копию', icon: 'i-lucide-copy', onSelect: () => duplicate(project) }], [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => askDelete(project) }]]"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="Действия с публикацией" /></UDropdownMenu>
          </div>
        </UCard>
      </div>
      <EmptyState v-else icon="i-lucide-images" title="Публикаций пока нет" description="Выберите шаблон и создайте первый макет." action-label="Выбрать шаблон" @action="navigateTo('/templates')" />
    </template>
  </UDashboardPanel>
  <UModal v-model:open="deleteOpen" title="Удалить публикацию?" description="Будут удалены текущая версия и история изменений.">
    <template #footer="{ close }"><div class="flex w-full justify-end gap-2"><UButton label="Отмена" color="neutral" variant="outline" @click="close" /><UButton label="Удалить" color="error" @click="removeProject" /></div></template>
  </UModal>
</template>
