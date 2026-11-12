<!-- @level L3-Humble -->
<script setup lang="ts">
import type { Team } from '~/types/dotaframe'
import type { MatchResult, fixtureRecord } from '~/utils/matches'

const props = defineProps<{ team: Team, record: ReturnType<typeof fixtureRecord>, form: MatchResult[] }>()
const hasPandaScore = computed(() => props.team.externalRefs?.some(ref => ref.provider === 'pandascore'))
const FORM_META: Record<MatchResult, { letter: string, label: string, class: string }> = {
  win: { letter: 'В', label: 'победа', class: 'bg-success/15 text-success ring-success/30' },
  loss: { letter: 'П', label: 'поражение', class: 'bg-error/15 text-error ring-error/30' },
  draw: { letter: 'Н', label: 'ничья', class: 'bg-elevated text-muted ring-default' }
}
const tiles = computed(() => [
  { label: 'Матчей', value: String(props.record.played), class: 'text-highlighted' },
  { label: 'Победы', value: String(props.record.wins), class: 'text-success' },
  { label: 'Поражения', value: String(props.record.losses), class: 'text-error' },
  { label: 'Винрейт', value: props.record.winRate === null ? '—' : `${props.record.winRate}%`, class: 'text-highlighted' },
  { label: 'Карты', value: props.record.played ? `${props.record.mapsFor}:${props.record.mapsAgainst}` : '—', class: 'text-highlighted' }
])
const formLabel = computed(() => props.form.length ? `Последние результаты, от старых к новым: ${props.form.map(result => FORM_META[result].label).join(', ')}` : 'Завершённых матчей пока нет')
</script>

<template>
  <section class="relative overflow-hidden rounded-xl border border-default bg-elevated p-5 sm:p-6" aria-label="Избранная команда">
    <div class="df-grid absolute inset-0 opacity-40" aria-hidden="true" />
    <div class="relative flex flex-wrap items-center gap-x-6 gap-y-5">
      <div class="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-default ring ring-default sm:size-24">
        <img v-if="team.logoAssetId" :src="`/api/media/${team.logoAssetId}`" :alt="`Логотип ${team.name}`" class="size-16 object-contain sm:size-20">
        <UIcon v-else name="i-df-no-logo" class="size-12 text-dimmed" />
      </div>
      <div class="min-w-0 flex-1 basis-64">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge label="Избранная команда" icon="i-lucide-star" color="primary" variant="subtle" />
          <UBadge v-if="hasPandaScore" label="PandaScore" color="neutral" variant="subtle" />
        </div>
        <h1 class="df-display mt-2 truncate text-3xl font-bold leading-none tracking-tight text-highlighted sm:text-5xl">{{ team.name }}</h1>
        <p class="mt-2 text-sm text-muted">
          {{ [team.shortName, team.region].filter(Boolean).join(' · ') || 'Сокращение и регион не заполнены' }}
          <NuxtLink to="/settings#favorite-team" class="ml-2 text-primary hover:underline">Сменить</NuxtLink>
        </p>
      </div>
      <dl class="grid w-full grid-cols-5 gap-2 text-center lg:w-auto lg:min-w-96">
        <div v-for="tile in tiles" :key="tile.label" class="rounded-lg bg-default/70 px-2 py-2 ring ring-default">
          <dd class="text-lg font-semibold tabular-nums sm:text-xl" :class="tile.class">{{ tile.value }}</dd>
          <dt class="text-[11px] text-muted">{{ tile.label }}</dt>
        </div>
      </dl>
    </div>
    <div class="relative mt-4 flex flex-wrap items-center gap-3 border-t border-default/70 pt-4">
      <span class="text-sm text-muted">Форма</span>
      <ul v-if="form.length" class="flex gap-1.5" :aria-label="formLabel">
        <li v-for="(result, index) in form" :key="index" class="grid size-7 place-items-center rounded-md text-xs font-semibold ring" :class="FORM_META[result].class" :title="FORM_META[result].label">{{ FORM_META[result].letter }}</li>
      </ul>
      <span v-else class="text-sm text-dimmed">Статистика появится после первых завершённых матчей.</span>
    </div>
  </section>
</template>
