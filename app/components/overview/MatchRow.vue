<!-- @level L3-Humble -->
<script setup lang="ts">
import { type FixtureView, kickoffLabel } from '~/utils/matches'

/** One line of the schedule or of the results list. */
const props = defineProps<{ fixture: FixtureView, now: Date, busy?: boolean }>()
const emit = defineEmits<{ createPackage: [] }>()
const kickoff = computed(() => kickoffLabel(props.fixture.start, props.now))
const RESULT_META = {
  win: { letter: 'В', color: 'success' as const },
  loss: { letter: 'П', color: 'error' as const },
  draw: { letter: 'Н', color: 'neutral' as const }
}
const target = computed(() => props.fixture.localId ? (props.fixture.hasPackage ? `/matches/${props.fixture.localId}/package` : `/matches/${props.fixture.localId}`) : null)
const details = computed(() => [props.fixture.tournament, props.fixture.stage, props.fixture.format].filter(Boolean).join(' · '))
</script>

<template>
  <li class="flex items-center gap-3 px-4 py-3" :data-testid="`fixture-${fixture.key}`">
    <UBadge v-if="fixture.result" :label="`${RESULT_META[fixture.result].letter} ${fixture.ownScore ?? '–'}:${fixture.opponentScore ?? '–'}`" :color="RESULT_META[fixture.result].color" variant="subtle" class="w-16 shrink-0 justify-center tabular-nums" />
    <div v-else class="w-28 shrink-0 text-xs">
      <div v-if="fixture.status === 'live'" class="font-medium text-error">В эфире</div>
      <div v-else class="font-medium text-highlighted">{{ kickoff.absolute }}</div>
      <div v-if="kickoff.relative && fixture.status !== 'live'" class="text-muted">{{ kickoff.relative }}</div>
    </div>
    <UAvatar :src="fixture.opponentLogo ?? undefined" :alt="fixture.opponentName" icon="i-df-no-logo" size="sm" :ui="{ image: 'object-contain' }" class="shrink-0 bg-elevated" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium text-highlighted">vs {{ fixture.opponentName }}</div>
      <div class="truncate text-xs text-muted">{{ fixture.result ? `${kickoff.absolute} · ` : '' }}{{ details }}</div>
    </div>
    <UButton v-if="target" :to="target" :label="fixture.hasPackage ? 'Пакет' : undefined" :icon="fixture.hasPackage ? 'i-lucide-package' : 'i-lucide-chevron-right'" color="neutral" variant="ghost" size="sm" :aria-label="fixture.hasPackage ? `Пакет публикаций: матч с ${fixture.opponentName}` : `Открыть матч с ${fixture.opponentName}`" />
    <UButton v-else label="Создать пакет" icon="i-lucide-package-plus" color="neutral" variant="outline" size="sm" :loading="busy" @click="emit('createPackage')" />
  </li>
</template>
