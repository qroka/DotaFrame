<!-- @level L3-Humble -->
<script setup lang="ts">
import type { Hero } from '~~/src/types'
import { heroInitials, heroPortraitUrl } from '~~/src/data/heroes'

/** Bundled hero icon; falls back to the hero's initials when the file is missing. The hero name is always shown next to it, so the image is decorative. */
const props = defineProps<{ hero: Pick<Hero, 'name' | 'slug'> }>()
const failed = shallowRef(false)
const src = computed(() => failed.value ? null : heroPortraitUrl(props.hero))
watch(() => props.hero.slug, () => { failed.value = false })
</script>

<template>
  <img v-if="src" :src="src" alt="" loading="lazy" decoding="async" class="size-full object-cover" @error="failed = true">
  <span v-else class="grid size-full place-items-center bg-elevated text-sm font-semibold text-muted" aria-hidden="true">{{ heroInitials(hero) }}</span>
</template>
