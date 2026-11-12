/** Any JSON-like object; used where the exact shape is defined by the caller. */
export type AnyRecord = Record<string, any>;

export const clone = <T>(v: T): T => (v === undefined ? (undefined as T) : structuredClone(v));

export function deepMerge<T = any>(base: unknown, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? clone(base) : clone(patch)) as T;
  const out: AnyRecord = clone(base);
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out as T;
}

export const isPlainObject = (v: unknown): v is AnyRecord => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Blob);

/** Read nested value by "a.b.c" path. */
export function getPath(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Immutable set by "a.b.c" path. */
export function setPath<T = any>(obj: unknown, path: string, value: unknown): T {
  const keys = path.split('.');
  const out: AnyRecord = Array.isArray(obj) ? [...obj] : { ...((obj as AnyRecord | null) ?? {}) };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    const next = cur[k];
    cur[k] = Array.isArray(next) ? [...next] : { ...(next ?? {}) };
    cur = cur[k];
  }
  cur[keys.at(-1)!] = value;
  return out as T;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (isPlainObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}

export function normalizeSearch(str: unknown): string {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function matchesQuery(haystack: string | string[], query: unknown): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(Array.isArray(haystack) ? haystack.join(' ') : haystack);
  return q.split(' ').every((part) => hay.includes(part));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function slugify(str: unknown): string {
  const map: Record<string, string> = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return String(str ?? '')
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'dotaframe';
}
