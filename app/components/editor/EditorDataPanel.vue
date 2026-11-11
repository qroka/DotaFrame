<!-- @level L3-Humble -->
<script setup lang="ts">
import type { Match, PosterTemplate, Team } from '~/types/dotaframe'

const props = defineProps<{
  template: PosterTemplate, data: Record<string, any>, matches: Match[], teams: Team[], selectedMatchId?: string | null, selectedMatchIds?: string[]
}>()
const emit = defineEmits<{
  selectMatch: [id: string], selectMatches: [ids: string[]], updateText: [key: string, value: string]
}>()
const matchValue = computed({ get: () => props.selectedMatchId ?? '', set: value => emit('selectMatch', value) })
const matchesValue = computed({ get: () => props.selectedMatchIds ?? [], set: value => emit('selectMatches', value) })
const teamNames = computed(() => Object.fromEntries(props.teams.map(team => [team.id, team.name])))
const matchOptions = computed(() => props.matches.map(match => ({
  label: `${teamNames.value[match.teamAId] || 'Команда A'} — ${teamNames.value[match.teamBId] || 'Команда B'} · ${match.startDate}`,
  value: match.id
})))
</script>

<template>
  <div class="space-y-6 p-4">
    <section>
      <h2 class="mb-3 text-sm font-semibold text-highlighted">Источник данных</h2>
      <UFormField v-if="template.source !== 'matches'" label="Матч">
        <USelectMenu v-model="matchValue" :items="matchOptions" value-key="value" searchable class="w-full" placeholder="Выберите матч" />
      </UFormField>
      <UFormField v-else label="Матчи" description="Для игрового дня можно выбрать до шести матчей">
        <USelectMenu v-model="matchesValue" :items="matchOptions" value-key="value" multiple searchable class="w-full" placeholder="Выберите матчи" />
      </UFormField>
      <UAlert v-if="!matches.length" class="mt-3" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Нет матчей" description="Добавьте матч в справочник и вернитесь в редактор." />
    </section>
    <USeparator />
    <section v-if="template.texts.length" class="space-y-4">
      <h2 class="text-sm font-semibold text-highlighted">Текст на постере</h2>
      <UFormField v-for="field in template.texts" :key="field.key" :label="field.label" :hint="field.maxLength ? `${String(data.texts?.[field.key] ?? '').length}/${field.maxLength}` : undefined">
        <UInput :model-value="data.texts?.[field.key] ?? ''" :maxlength="field.maxLength" class="w-full" @update:model-value="emit('updateText', field.key, String($event))" />
      </UFormField>
    </section>
    <UAlert color="info" variant="subtle" icon="i-lucide-scan-text" title="Снимок данных" description="После сохранения публикация не изменится при редактировании матча или команды." />
  </div>
</template>
