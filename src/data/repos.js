/**
 * Entity repositories over IndexedDB: teams, matches, drafts, projects, revisions, settings.
 * Every write emits `data:changed` with { store, id } so open screens can refresh.
 */
import { STORES, dbGet, dbGetAll, dbIndexAll, tx } from './db.js';
import { createId, nowIso } from '../core/ids.js';
import { emit } from '../core/events.js';
import { validateMatch } from '../domain/series.js';
import { DEFAULT_TIMEZONE } from '../domain/time.js';

export class ValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] ?? 'Проверьте заполнение полей');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const changed = (store, id, action = 'put') => emit('data:changed', { store, id, action });

/* ---------------- Teams ---------------- */

export function validateTeam(t) {
  const errors = {};
  const name = (t.name ?? '').trim();
  if (!name) errors.name = 'Введите название команды';
  else if (name.length > 60) errors.name = 'Не больше 60 символов';
  if ((t.shortName ?? '').trim().length > 12) errors.shortName = 'Короткое название — не больше 12 символов';
  return errors;
}

export const teams = {
  list: async () => (await dbGetAll(STORES.teams)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  get: (id) => (id ? dbGet(STORES.teams, id) : Promise.resolve(null)),
  async save(input) {
    const errors = validateTeam(input);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const existing = input.id ? await dbGet(STORES.teams, input.id) : null;
    const record = {
      id: input.id || createId('team'),
      name: input.name.trim(),
      shortName: (input.shortName ?? '').trim(),
      logoAssetId: input.logoAssetId ?? null,
      region: (input.region ?? '').trim(),
      notes: (input.notes ?? '').trim(),
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await tx(STORES.teams, 'readwrite', (s) => s.teams.put(record));
    changed(STORES.teams, record.id);
    return record;
  },
  /** Teams referenced by matches cannot be removed (historical posters keep their own snapshot anyway). */
  async usage(id) {
    const all = await dbGetAll(STORES.matches);
    return all.filter((m) => m.teamAId === id || m.teamBId === id).length;
  },
  async remove(id) {
    const used = await teams.usage(id);
    if (used) throw new Error(`Команда используется в ${used} матч(ах). Сначала удалите или измените эти матчи.`);
    await tx(STORES.teams, 'readwrite', (s) => s.teams.delete(id));
    changed(STORES.teams, id, 'delete');
  },
  async findDuplicate(name, exceptId) {
    const n = name.trim().toLowerCase();
    return (await dbGetAll(STORES.teams)).find((t) => t.id !== exceptId && t.name.trim().toLowerCase() === n) ?? null;
  },
};

/* ---------------- Matches ---------------- */

export function emptyMatch() {
  return {
    id: null,
    teamAId: '',
    teamBId: '',
    tournament: '',
    stage: '',
    startDate: '',
    startTime: '',
    timezone: DEFAULT_TIMEZONE,
    format: 'BO3',
    status: 'scheduled',
    scoreA: null,
    scoreB: null,
    notes: '',
  };
}

const toScore = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export const matches = {
  list: () => dbGetAll(STORES.matches),
  get: (id) => (id ? dbGet(STORES.matches, id) : Promise.resolve(null)),
  async save(input) {
    const m = { ...emptyMatch(), ...input, scoreA: toScore(input.scoreA), scoreB: toScore(input.scoreB) };
    if (m.status === 'scheduled' || m.status === 'cancelled') {
      m.scoreA = null;
      m.scoreB = null;
    }
    const errors = validateMatch(m);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const [a, b] = await Promise.all([teams.get(m.teamAId), teams.get(m.teamBId)]);
    if (!a || !b) throw new ValidationError({ teamAId: 'Команда не найдена в справочнике' });
    const existing = m.id ? await dbGet(STORES.matches, m.id) : null;
    const record = {
      ...m,
      id: m.id || createId('match'),
      tournament: (m.tournament ?? '').trim(),
      stage: (m.stage ?? '').trim(),
      notes: (m.notes ?? '').trim(),
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await tx(STORES.matches, 'readwrite', (s) => s.matches.put(record));
    changed(STORES.matches, record.id);
    return record;
  },
  async remove(id) {
    // Drafts belong to the match; projects keep their own snapshots and stay readable.
    await tx([STORES.matches, STORES.drafts], 'readwrite', async (s) => {
      for (const d of await s.drafts.indexAll('matchId', id)) await s.drafts.delete(d.id);
      await s.matches.delete(id);
    });
    changed(STORES.matches, id, 'delete');
  },
};

/* ---------------- Drafts (GameDraft) ---------------- */

export function emptyDraft(match, mapNumber = 1) {
  return {
    id: null,
    matchId: match?.id ?? null,
    mapNumber,
    radiantTeamId: match?.teamAId ?? '',
    direTeamId: match?.teamBId ?? '',
    picksRadiant: [null, null, null, null, null],
    picksDire: [null, null, null, null, null],
    bansRadiant: [],
    bansDire: [],
    winner: null, // 'radiant' | 'dire' | null — optional map result shown on the poster
    updatedAt: null,
  };
}

export const drafts = {
  forMatch: (matchId) => dbIndexAll(STORES.drafts, 'matchId', matchId),
  get: (id) => (id ? dbGet(STORES.drafts, id) : Promise.resolve(null)),
  async find(matchId, mapNumber) {
    return (await drafts.forMatch(matchId)).find((d) => d.mapNumber === mapNumber) ?? null;
  },
  /** One GameDraft per (matchId, mapNumber): saving reuses the existing id. */
  async save(input) {
    const existing = input.matchId ? await drafts.find(input.matchId, input.mapNumber) : null;
    const record = { ...input, id: existing?.id ?? input.id ?? createId('draft'), updatedAt: nowIso() };
    await tx(STORES.drafts, 'readwrite', (s) => s.drafts.put(record));
    changed(STORES.drafts, record.id);
    return record;
  },
  async remove(id) {
    await tx(STORES.drafts, 'readwrite', (s) => s.drafts.delete(id));
    changed(STORES.drafts, id, 'delete');
  },
};

/* ---------------- Projects (PosterProject) + revisions ---------------- */

const MAX_REVISIONS = 30;

export const projects = {
  list: async () => (await dbGetAll(STORES.projects)).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
  get: (id) => (id ? dbGet(STORES.projects, id) : Promise.resolve(null)),
  forMatch: (matchId) => dbIndexAll(STORES.projects, 'matchId', matchId),
  /**
   * Save the project and append an immutable revision (data snapshot + style + template version).
   * Old revisions are trimmed to MAX_REVISIONS; their assets are released only by GC.
   */
  async save(project, { revision = true, note = '' } = {}) {
    const now = nowIso();
    const record = { ...project, id: project.id || createId('poster'), createdAt: project.createdAt ?? now, updatedAt: now, savedAt: now };
    await tx([STORES.projects, STORES.revisions], 'readwrite', async (s) => {
      await s.projects.put(record);
      if (revision) {
        await s.revisions.put({
          id: createId('rev'),
          projectId: record.id,
          savedAt: now,
          note,
          title: record.title,
          templateId: record.templateId,
          templateVersion: record.templateVersion,
          size: record.size,
          data: record.data,
          style: record.style,
          thumbnailAssetId: record.thumbnailAssetId ?? null,
        });
        const revs = (await s.revisions.indexAll('projectId', record.id)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        for (const old of revs.slice(MAX_REVISIONS)) await s.revisions.delete(old.id);
      }
    });
    changed(STORES.projects, record.id);
    return record;
  },
  async revisions(projectId) {
    return (await dbIndexAll(STORES.revisions, 'projectId', projectId)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  async remove(id) {
    await tx([STORES.projects, STORES.revisions], 'readwrite', async (s) => {
      for (const r of await s.revisions.indexAll('projectId', id)) await s.revisions.delete(r.id);
      await s.projects.delete(id);
    });
    changed(STORES.projects, id, 'delete');
  },
};

/* ---------------- Settings (key/value) ---------------- */

export const settings = {
  async get(key, fallback = null) {
    const row = await dbGet(STORES.settings, key);
    return row ? row.value : fallback;
  },
  async set(key, value) {
    await tx(STORES.settings, 'readwrite', (s) => s.settings.put({ key, value }));
    changed(STORES.settings, key);
  },
};
