/**
 * MediaAsset repository: immutable image blobs in IndexedDB.
 *
 * Rules (see docs/architecture/data-model.md):
 *  - an asset is never overwritten — replacing a logo creates a new asset id;
 *  - `blob:` URLs are session-only views created from stored Blobs on demand;
 *  - files are validated by magic bytes, size and successful decoding.
 */
import { STORES, dbGet, dbGetAll, tx } from './db.js';
import { createId, nowIso } from '../core/ids.js';

export const MEDIA_KINDS = {
  logo: { maxBytes: 8 * 1024 * 1024, maxDimension: 2048 },
  background: { maxBytes: 25 * 1024 * 1024, maxDimension: 2560 },
  player: { maxBytes: 25 * 1024 * 1024, maxDimension: 2560 },
  hero: { maxBytes: 4 * 1024 * 1024, maxDimension: 512 },
  thumbnail: { maxBytes: 4 * 1024 * 1024, maxDimension: 512 },
  other: { maxBytes: 25 * 1024 * 1024, maxDimension: 2560 },
};

export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg';

export class MediaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaError';
  }
}

/** Detect image type from the first bytes; extension/mime can lie. */
export async function sniffImageType(blob) {
  const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
  const starts = (...bytes) => bytes.every((b, i) => head[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
  const text = new TextDecoder().decode(head).trimStart().toLowerCase();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml';
  return null;
}

function decodeImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const result = { width: img.naturalWidth || 0, height: img.naturalHeight || 0, img, url };
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new MediaError('Не удалось прочитать изображение: файл повреждён или формат не поддерживается'));
    };
    img.src = url;
  });
}

async function downscale(decoded, type, maxDimension) {
  const { width, height, img } = decoded;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  if (scale >= 1) return null;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const outType = type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((res) => canvas.toBlob(res, outType, 0.92));
  return blob ? { blob, width: w, height: h, mimeType: outType } : null;
}

/**
 * Validate a user file and turn it into a storable asset record (not yet saved).
 * Throws MediaError with a user-facing message.
 */
export async function prepareAsset(file, kind = 'other') {
  const rules = MEDIA_KINDS[kind] ?? MEDIA_KINDS.other;
  if (!(file instanceof Blob)) throw new MediaError('Файл не выбран');
  if (file.size === 0) throw new MediaError('Файл пустой');
  if (file.size > rules.maxBytes) throw new MediaError(`Файл слишком большой: максимум ${Math.round(rules.maxBytes / 1024 / 1024)} МБ`);
  const type = await sniffImageType(file);
  if (!type) throw new MediaError('Поддерживаются только PNG, JPEG, WebP, GIF и SVG');

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) {
      if (type !== 'image/svg+xml') throw new MediaError('Изображение не содержит пикселей');
    }
    let blob = file;
    let { width, height } = decoded;
    let mimeType = type;
    if (type !== 'image/svg+xml' && type !== 'image/gif') {
      const scaled = await downscale(decoded, type, rules.maxDimension);
      if (scaled) ({ blob, width, height, mimeType } = scaled);
    }
    // Store as a plain Blob with the verified type (File objects carry names/paths we don't need).
    const data = new Blob([await blob.arrayBuffer()], { type: mimeType });
    return {
      id: createId('media'),
      kind,
      mimeType,
      fileName: String(file.name ?? `${kind}.${mimeType.split('/')[1]}`).slice(0, 120),
      size: data.size,
      width,
      height,
      blob: data,
      createdAt: nowIso(),
    };
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

export async function saveAsset(asset) {
  await tx(STORES.media, 'readwrite', (s) => s.media.put(asset));
  return asset;
}

/** Validate + store a file. Returns the stored asset record. */
export async function importFile(file, kind) {
  return saveAsset(await prepareAsset(file, kind));
}

export const getAsset = (id) => (id ? dbGet(STORES.media, id) : Promise.resolve(null));
export const listAssets = () => dbGetAll(STORES.media);

/* ---------- Object URL cache (session only) ---------- */

const urlCache = new Map(); // id -> url
const pending = new Map();

/** Resolve an asset id to a session object URL; null if missing. */
export async function assetUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  if (pending.has(id)) return pending.get(id);
  const p = getAsset(id)
    .then((asset) => {
      if (!asset?.blob) return null;
      const url = URL.createObjectURL(asset.blob);
      urlCache.set(id, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

/** Resolve many ids at once → { [id]: url|null } */
export async function assetUrls(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const entries = await Promise.all(unique.map(async (id) => [id, await assetUrl(id)]));
  return Object.fromEntries(entries);
}

export function cachedAssetUrl(id) {
  return id ? (urlCache.get(id) ?? null) : null;
}

export function revokeAllUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/* ---------- Garbage collection ---------- */

/** Collect every asset id referenced anywhere (teams, projects, revisions, portraits, settings). */
export function collectAssetRefs(value, out = new Set()) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectAssetRefs(v, out);
  } else if (typeof value === 'object' && !(value instanceof Blob)) {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && /assetid$/i.test(k) && v) out.add(v);
      else collectAssetRefs(v, out);
    }
  }
  return out;
}

/**
 * Remove assets not referenced by any record. Historical snapshots keep their
 * assets alive, so old posters never lose images.
 */
export async function collectGarbage({ dryRun = false } = {}) {
  return tx([STORES.media, STORES.teams, STORES.projects, STORES.revisions, STORES.heroPortraits, STORES.settings], dryRun ? 'readonly' : 'readwrite', async (s) => {
    const refs = new Set();
    for (const store of [STORES.teams, STORES.projects, STORES.revisions, STORES.heroPortraits, STORES.settings]) {
      collectAssetRefs(await s[store].getAll(), refs);
    }
    const all = await s.media.getAll();
    const orphans = all.filter((a) => !refs.has(a.id));
    if (!dryRun) for (const a of orphans) await s.media.delete(a.id);
    return { removed: orphans.length, bytes: orphans.reduce((n, a) => n + (a.size || 0), 0) };
  });
}

/** Blob → data URL (for backups / export embedding). */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
