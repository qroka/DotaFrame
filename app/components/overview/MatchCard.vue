<!-- @level L3-Humble -->
<script setup lang="ts">
import type { Team } from '~/types/dotaframe'
import { type FixtureView, kickoffLabel } from '~/utils/matches'

/** The featured upcoming (or live) match of the favourite team. */
const props = defineProps<{ fixture: FixtureView, team: Team, now: Date, busy?: boolean }>()
const emit = defineEmits<{ createPackage: [] }>()
const kickoff = computed(() => kickoffLabel(props.fixture.start, props.now))
const live = computed(() => props.fixture.status === 'live')
const target = computed(() => props.fixture.localId ? (props.fixture.hasPackage ? `/matches/${props.fixture.localId}/package` : `/matches/${props.fixture.localId}`) : null)
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-5' }" data-testid="next-match">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-highlighted">{{ fixture.tournament || 'Турнир не указан' }}</p>
        <p v-if="fixture.stage" class="mt-0.5 truncate text-xs text-muted">{{ fixture.stage }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <UBadge :label="fixture.format" color="neutral" variant="outline" size="sm" />
        <UBadge v-if="live" label="В эфире" icon="i-lucide-radio" color="error" variant="subtle" />
        <UBadge v-else-if="kickoff.relative" :label="kickoff.relative" color="primary" variant="subtle" />
      </div>
    </div>
    <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div class="min-w-0 text-center">
        <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-lg border border-default bg-muted">
          <img v-if="team.logoAssetId" :src="`/api/media/${team.logoAssetId}`" :alt="`Логотип ${team.name}`" class="size-12 object-contain">
          <UIcon v-else name="i-df-no-logo" class="size-8 text-dimmed" />
        </div>
        <p class="mt-2 truncate text-sm font-semibold text-highlighted">{{ team.name }}</p>
      </div>
      <div class="text-center">
        <div v-if="fixture.ownScore !== null" class="df-display text-4xl font-bold tabular-nums text-highlighted">{{ fixture.ownScore }}:{{ fixture.opponentScore }}</div>
        <div v-else class="df-display text-2xl font-bold text-muted">VS</div>
        <div class="mt-1 text-xs text-muted">{{ kickoff.absolute }}</div>
      </div>
      <div class="min-w-0 text-center">
        <div class="mx-auto grid size-16 place-items-center overflow-hidden rounded-lg border border-default bg-muted">
          <img v-if="fixture.opponentLogo" :src="fixture.opponentLogo" :alt="`Логотип ${fixture.opponentName}`" class="size-12 object-contain" loading="lazy">
          <UIcon v-else name="i-df-no-logo" class="size-8 text-dimmed" />
        </div>
        <p class="mt-2 truncate text-sm font-semibold text-highlighted">{{ fixture.opponentName }}</p>
      </div>
    </div>
    <div class="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-default pt-4">
      <UButton v-if="target" :to="target" :label="fixture.hasPackage ? 'Пакет публикаций' : 'Открыть матч'" :icon="fixture.hasPackage ? 'i-lucide-package' : 'i-lucide-swords'" />
      <UButton v-else label="Создать пакет" icon="i-lucide-package-plus" :loading="busy" @click="emit('createPackage')" />
    </div>
  </UCard>
</template>
