/**
 * Local hero portrait pack: heroId → current portrait MediaAsset.
 * Portrait assets are immutable; replacing one creates a new asset, so saved
 * draft posters (which snapshot portraitAssetId) keep their original image.
 */
import { STORES, dbGetAll, tx } from './db.js';
import { emit } from '../core/events.js';
import { nowIso } from '../core/ids.js';

export async function portraitMap() {
  const rows = await dbGetAll(STORES.heroPortraits);
  return Object.fromEntries(rows.map((r) => [r.heroId, r.assetId]));
}

export async function setPortrait(heroId, assetId) {
  await tx(STORES.heroPortraits, 'readwrite', (s) => (assetId ? s.heroPortraits.put({ heroId, assetId, updatedAt: nowIso() }) : s.heroPortraits.delete(heroId)));
  emit('data:changed', { store: STORES.heroPortraits, id: heroId });
}

export async function setPortraits(entries) {
  await tx(STORES.heroPortraits, 'readwrite', async (s) => {
    for (const [heroId, assetId] of entries) await s.heroPortraits.put({ heroId, assetId, updatedAt: nowIso() });
  });
  emit('data:changed', { store: STORES.heroPortraits });
}

export async function clearPortraits() {
  await tx(STORES.heroPortraits, 'readwrite', (s) => s.heroPortraits.clear());
  emit('data:changed', { store: STORES.heroPortraits });
}
