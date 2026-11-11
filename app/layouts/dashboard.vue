<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const { error } = useDotaFrameDb()
const navigation = computed<NavigationMenuItem[][]>(() => [[
  { label: 'Обзор', icon: 'i-lucide-layout-dashboard', to: '/', active: route.path === '/' },
  { label: 'Команды', icon: 'i-lucide-shield', to: '/teams', active: route.path.startsWith('/teams') },
  { label: 'Матчи', icon: 'i-lucide-swords', to: '/matches', active: route.path.startsWith('/matches') },
  { label: 'Публикации', icon: 'i-lucide-images', to: '/projects', active: route.path.startsWith('/projects') },
  { label: 'Шаблоны', icon: 'i-lucide-layout-template', to: '/templates', active: route.path.startsWith('/templates') }
], [
  { label: 'Настройки', icon: 'i-lucide-settings-2', to: '/settings', active: route.path.startsWith('/settings') }
]])
</script>

<template>
  <UDashboardGroup storage-key="dotaframe-dashboard">
    <UDashboardSidebar collapsible resizable mode="drawer" :min-size="14" :default-size="16" :max-size="21">
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-3" aria-label="DotaFrame — обзор">
          <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-inverted shadow-sm shadow-primary/20">
            <UIcon name="i-lucide-frame" class="size-5" />
          </div>
          <span v-if="!collapsed" class="df-display truncate text-xl font-bold tracking-tight">DotaFrame</span>
        </NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="navigation" orientation="vertical" tooltip popover />
      </template>
      <template #footer="{ collapsed }">
        <div v-if="!collapsed" class="px-2 text-xs leading-relaxed text-muted">Данные хранятся в локальной базе DotaFrame.</div>
        <UColorModeButton v-else block color="neutral" variant="ghost" />
      </template>
    </UDashboardSidebar>
    <slot />
    <UAlert v-if="error" class="fixed bottom-4 right-4 z-50 max-w-md" color="error" icon="i-lucide-database-zap" title="Локальное хранилище недоступно" :description="error" />
  </UDashboardGroup>
</template>
