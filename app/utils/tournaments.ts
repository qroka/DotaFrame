export type TournamentPhase = 'running' | 'upcoming' | 'past' | 'unknown'

/** Local date as YYYY-MM-DD, so a tournament ending today still counts as running. */
export function todayIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function tournamentPhase(startDate: string | null, endDate: string | null, today = todayIso()): TournamentPhase {
  if (!startDate && !endDate) return 'unknown'
  if (startDate && startDate > today) return 'upcoming'
  if (endDate && endDate < today) return 'past'
  if (!startDate && endDate && endDate >= today) return 'unknown'
  return 'running'
}

export const TOURNAMENT_PHASE_META: Record<TournamentPhase, { label: string, color: 'error' | 'primary' | 'neutral' | 'success' }> = {
  running: { label: 'Идёт', color: 'error' },
  upcoming: { label: 'Скоро', color: 'primary' },
  past: { label: 'Завершён', color: 'success' },
  unknown: { label: 'Без дат', color: 'neutral' }
}

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const format = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`))

export function formatTournamentDates(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) return startDate === endDate ? format(startDate) : `${format(startDate)} — ${format(endDate)}`
  if (startDate) return `с ${format(startDate)}`
  if (endDate) return `до ${format(endDate)}`
  return 'Даты не указаны'
}
