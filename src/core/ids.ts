/** Stable local identifiers, independent from names. */
export function createId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

export const nowIso = (): string => new Date().toISOString();
