import type { PackageItemStatus, PublicationPackageItem } from '~/types/dotaframe'

type Color = 'success' | 'warning' | 'neutral' | 'error' | 'primary'

export const PACKAGE_STATUS_META: Record<PackageItemStatus, { label: string, color: Color, icon: string }> = {
  ready: { label: 'Готово', color: 'success', icon: 'i-lucide-circle-check' },
  requires_input: { label: 'Требуется заполнение', color: 'warning', icon: 'i-lucide-pencil-line' },
  waiting_for_game: { label: 'Ожидает карту', color: 'neutral', icon: 'i-lucide-clock-3' },
  waiting_for_series: { label: 'Ожидает серию', color: 'neutral', icon: 'i-lucide-clock-3' },
  unavailable: { label: 'Недоступно', color: 'error', icon: 'i-lucide-circle-x' },
  created: { label: 'Создано', color: 'primary', icon: 'i-lucide-image-check' }
}

export const PACKAGE_STATUS_TEXT: Record<Color, string> = {
  success: 'text-success', warning: 'text-warning', neutral: 'text-muted', error: 'text-error', primary: 'text-primary'
}

/** Posts grouped the way a match unfolds: announcement, each map, then the series outcome. */
export function groupPackageItems(items: PublicationPackageItem[]) {
  const groups: Array<{ key: string, title: string, items: PublicationPackageItem[] }> = []
  const push = (key: string, title: string, item: PublicationPackageItem) => {
    const group = groups.find(candidate => candidate.key === key)
    if (group) group.items.push(item)
    else groups.push({ key, title, items: [item] })
  }
  for (const item of items) {
    if (item.kind === 'announcement') push('announcement', 'До матча', item)
    else if (item.mapNumber) push(`map-${item.mapNumber}`, `Карта №${item.mapNumber}`, item)
    else push('series', 'Итоги серии', item)
  }
  return groups
}

/** Items that still need attention: anything that is neither created nor ready to create. */
export const needsWork = (item: PublicationPackageItem) => item.status === 'requires_input' || item.status === 'unavailable'
