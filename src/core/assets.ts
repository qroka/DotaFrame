/**
 * Asset helpers shared by render, export and tests (no storage dependency).
 */

/** Collect every asset id referenced in a value: any string under a key ending in `assetId`. */
export function collectAssetRefs(value: unknown, out: Set<string> = new Set()): Set<string> {
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

/** Blob → data URL (for backups / export embedding). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
