/**
 * Backup / restore of all local data as a single JSON file.
 * Images are embedded as data URLs. Restore validates the format before writing
 * anything and runs in one transaction (all-or-nothing).
 */
import { STORES, DB_VERSION, tx } from './db.js';
import { blobToDataUrl, dataUrlToBlob, sniffImageType, revokeAllUrls } from './media.js';
import { emit } from '../core/events.js';

export const BACKUP_FORMAT = 'dotaframe-backup';
export const BACKUP_VERSION = 1;

const DATA_STORES = [STORES.teams, STORES.matches, STORES.drafts, STORES.projects, STORES.revisions, STORES.heroPortraits, STORES.settings];
const KEY = { [STORES.heroPortraits]: 'heroId', [STORES.settings]: 'key' };
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

export async function createBackup() {
  const out = await tx([...DATA_STORES, STORES.media], 'readonly', async (s) => {
    const data = {};
    for (const name of DATA_STORES) data[name] = await s[name].getAll();
    data.media = await s.media.getAll();
    return data;
  });
  const media = [];
  for (const m of out.media) {
    const { blob, ...meta } = m;
    media.push({ ...meta, data: blob ? await blobToDataUrl(blob) : null });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: DB_VERSION,
    app: 'DotaFrame',
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries([...DATA_STORES.map((n) => [n, out[n].length]), ['media', media.length]]),
    data: { ...Object.fromEntries(DATA_STORES.map((n) => [n, out[n]])), media },
  };
}

export async function backupBlob() {
  const backup = await createBackup();
  return { blob: new Blob([JSON.stringify(backup)], { type: 'application/json' }), backup };
}

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Validate a parsed backup object. Throws BackupError with a user-facing message. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new BackupError('Файл не является резервной копией DotaFrame');
  if (obj.format !== BACKUP_FORMAT) throw new BackupError('Неизвестный формат файла: ожидается резервная копия DotaFrame');
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) throw new BackupError(`Резервная копия создана более новой версией DotaFrame (формат v${obj.version})`);
  if (!obj.data || typeof obj.data !== 'object') throw new BackupError('В файле нет данных');
  for (const name of [...DATA_STORES, 'media']) {
    const list = obj.data[name] ?? [];
    if (!Array.isArray(list)) throw new BackupError(`Повреждён раздел «${name}»`);
    const key = KEY[name] ?? 'id';
    for (const rec of list) {
      if (!rec || typeof rec !== 'object' || typeof rec[key] !== 'string' || !rec[key]) throw new BackupError(`В разделе «${name}» есть запись без идентификатора`);
    }
  }
  for (const t of obj.data.teams ?? []) if (typeof t.name !== 'string') throw new BackupError('Повреждена запись команды');
  for (const m of obj.data.matches ?? []) if (typeof m.teamAId !== 'string' || typeof m.teamBId !== 'string') throw new BackupError('Повреждена запись матча');
  for (const p of obj.data.projects ?? []) if (typeof p.templateId !== 'string' || !p.data || !p.style) throw new BackupError('Повреждена запись публикации');
  for (const m of obj.data.media ?? []) {
    if (m.data !== null && (typeof m.data !== 'string' || !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(m.data))) throw new BackupError('В копии есть изображение неподдерживаемого формата');
    if (m.data && m.data.length * 0.75 > MAX_MEDIA_BYTES) throw new BackupError('В копии есть слишком большое изображение');
  }
  return true;
}

/**
 * Restore a backup. mode 'replace' wipes current data first; 'merge' upserts by id.
 * @returns counts of restored records
 */
export async function restoreBackup(obj, { mode = 'merge' } = {}) {
  validateBackup(obj);
  // Decode images before opening the transaction (IDB transactions can't await fetch).
  const media = [];
  for (const m of obj.data.media ?? []) {
    if (!m.data) continue;
    const blob = await dataUrlToBlob(m.data);
    const type = await sniffImageType(blob);
    if (!type) throw new BackupError(`Изображение ${m.fileName || m.id} повреждено`);
    const { data, ...meta } = m;
    media.push({ ...meta, mimeType: type, blob: new Blob([blob], { type }), size: blob.size });
  }
  const counts = {};
  await tx([...DATA_STORES, STORES.media], 'readwrite', async (s) => {
    if (mode === 'replace') for (const name of [...DATA_STORES, STORES.media]) await s[name].clear();
    for (const name of DATA_STORES) {
      const list = obj.data[name] ?? [];
      for (const rec of list) await s[name].put(rec);
      counts[name] = list.length;
    }
    for (const m of media) await s.media.put(m);
    counts.media = media.length;
  });
  revokeAllUrls();
  emit('data:changed', { store: '*', action: 'restore' });
  return counts;
}

export async function readBackupFile(file) {
  if (!file) throw new BackupError('Файл не выбран');
  if (file.size > 500 * 1024 * 1024) throw new BackupError('Файл слишком большой');
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    throw new BackupError('Файл повреждён или не является JSON');
  }
  validateBackup(obj);
  return obj;
}
