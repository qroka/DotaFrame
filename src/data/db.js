/**
 * IndexedDB access layer.
 *
 * - One database `dotaframe`, versioned schema with ordered migrations.
 * - Promise API: get / getAll / put / delete / tx for multi-store atomic writes.
 * - Blobs (images) are stored directly in the `media` store — never `blob:` URLs.
 *
 * To change the schema: append a migration to MIGRATIONS (never edit old ones)
 * and bump nothing else — DB_VERSION is derived from the list length.
 */
import { emit } from '../core/events.js';

export const DB_NAME = 'dotaframe';

export const STORES = {
  teams: 'teams',
  media: 'media',
  matches: 'matches',
  drafts: 'drafts',
  projects: 'projects',
  revisions: 'revisions',
  heroPortraits: 'heroPortraits',
  settings: 'settings',
};

/** Ordered schema migrations. Index i upgrades from version i to i+1. */
const MIGRATIONS = [
  // v1 — initial schema
  (db) => {
    db.createObjectStore(STORES.teams, { keyPath: 'id' }).createIndex('name', 'name');
    db.createObjectStore(STORES.media, { keyPath: 'id' });
    const matches = db.createObjectStore(STORES.matches, { keyPath: 'id' });
    matches.createIndex('startDate', 'startDate');
    const drafts = db.createObjectStore(STORES.drafts, { keyPath: 'id' });
    drafts.createIndex('matchId', 'matchId');
    const projects = db.createObjectStore(STORES.projects, { keyPath: 'id' });
    projects.createIndex('updatedAt', 'updatedAt');
    projects.createIndex('matchId', 'matchId');
    db.createObjectStore(STORES.revisions, { keyPath: 'id' }).createIndex('projectId', 'projectId');
    db.createObjectStore(STORES.heroPortraits, { keyPath: 'heroId' });
    db.createObjectStore(STORES.settings, { keyPath: 'key' });
  },
];

export const DB_VERSION = MIGRATIONS.length;

let dbPromise = null;

export class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

function humanize(err) {
  if (!err) return 'Неизвестная ошибка хранилища';
  if (err.name === 'QuotaExceededError') return 'Недостаточно места в хранилище браузера. Удалите неиспользуемые изображения или сделайте резервную копию и очистите данные.';
  if (err.name === 'VersionError') return 'База данных создана более новой версией DotaFrame. Обновите страницу или приложение.';
  if (err.name === 'InvalidStateError') return 'Хранилище браузера недоступно (возможно, приватный режим).';
  return err.message || String(err);
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('IndexedDB не поддерживается этим браузером'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        emit('storage:versionchange');
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(new StorageError(humanize(req.error), req.error));
    };
    req.onblocked = () => emit('storage:blocked');
  });
  return dbPromise;
}

/** Close and forget the connection (tests, wipe). */
export async function closeDb() {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(humanize(req.error), req.error));
  });

/**
 * Run `fn(stores)` inside a single transaction over `storeNames`.
 * `stores[name]` exposes get/getAll/put/delete/indexAll returning promises.
 * Resolves with fn's return value once the transaction commits.
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    let result;
    let transaction;
    try {
      transaction = db.transaction(names, mode);
    } catch (err) {
      reject(new StorageError(humanize(err), err));
      return;
    }
    const stores = {};
    for (const name of names) {
      const store = transaction.objectStore(name);
      stores[name] = {
        get: (key) => wrap(store.get(key)),
        getAll: () => wrap(store.getAll()),
        put: (value) => wrap(store.put(value)),
        delete: (key) => wrap(store.delete(key)),
        clear: () => wrap(store.clear()),
        count: () => wrap(store.count()),
        indexAll: (index, key) => wrap(store.index(index).getAll(key)),
      };
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(new StorageError(humanize(transaction.error), transaction.error));
    transaction.onerror = (e) => {
      e.preventDefault?.();
    };
    Promise.resolve()
      .then(() => fn(stores))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        try {
          transaction.abort();
        } catch {
          /* already finished */
        }
        reject(err instanceof StorageError ? err : new StorageError(humanize(err), err));
      });
  });
}

export const dbGet = (store, key) => tx(store, 'readonly', (s) => s[store].get(key));
export const dbGetAll = (store) => tx(store, 'readonly', (s) => s[store].getAll());
export const dbPut = (store, value) => tx(store, 'readwrite', (s) => s[store].put(value));
export const dbDelete = (store, key) => tx(store, 'readwrite', (s) => s[store].delete(key));
export const dbIndexAll = (store, index, key) => tx(store, 'readonly', (s) => s[store].indexAll(index, key));

/** Delete all data (used by backup restore in "replace" mode and tests). */
export async function wipeAll() {
  await tx(Object.values(STORES), 'readwrite', async (s) => {
    for (const name of Object.values(STORES)) await s[name].clear();
  });
}

/** Browser storage estimate + persistence state. */
export async function storageInfo() {
  const info = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      info.usage = est.usage ?? null;
      info.quota = est.quota ?? null;
    }
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
  } catch {
    /* not supported */
  }
  return info;
}

export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
