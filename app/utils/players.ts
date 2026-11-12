import type { PlayerRole } from '~/types/dotaframe'

export const PLAYER_ROLE_LABELS: Record<Exclude<PlayerRole, ''>, string> = {
  1: 'Керри', 2: 'Мидер', 3: 'Оффлейнер', 4: 'Роумер', 5: 'Саппорт'
}

/** "Pos 1 · Керри", or an em dash when the position is unknown. */
export function playerRoleLabel(role: PlayerRole | string | null | undefined) {
  return role && role in PLAYER_ROLE_LABELS ? `Pos ${role} · ${PLAYER_ROLE_LABELS[role as Exclude<PlayerRole, ''>]}` : '—'
}

export const PLAYER_ROLE_ITEMS = [
  { label: 'Не указана', value: 'none' },
  ...(['1', '2', '3', '4', '5'] as const).map(role => ({ label: playerRoleLabel(role), value: role }))
]

let regionNames: Intl.DisplayNames | null = null
/** Country name for an ISO 3166 alpha-2 code ("UA" → "Украина"); free text is returned as is. */
export function countryLabel(value: string | null | undefined) {
  const code = value?.trim() ?? ''
  if (!/^[A-Za-z]{2}$/.test(code)) return code
  try {
    regionNames ??= new Intl.DisplayNames(['ru'], { type: 'region' })
    return regionNames.of(code.toUpperCase()) ?? code
  } catch { return code }
}
