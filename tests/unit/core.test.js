import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/editor/store.js';
import { collectAssetRefs } from '../../src/core/assets';
import { buildMatchData, snapshotTeam } from '../../src/domain/snapshot';
import { deepMerge, setPath, matchesQuery, slugify } from '../../src/core/utils';
import { formatPosterDate } from '../../src/domain/time';

describe('editor store', () => {
  const init = { title: 'A', templateId: 't', data: { x: 1 }, style: { y: 1 }, size: '1080x1080' };
  it('undo/redo restores states', () => {
    const s = createStore(init);
    s.commit({ ...s.get(), title: 'B' }, { label: 'title' });
    s.commit({ ...s.get(), title: 'C' }, { label: 'title' });
    expect(s.undo()).toBe('title');
    expect(s.get().title).toBe('B');
    s.redo();
    expect(s.get().title).toBe('C');
  });
  it('coalesces rapid edits with the same key', () => {
    const s = createStore(init);
    s.commit({ ...s.get(), title: 'B' }, { coalesce: 'k' });
    s.commit({ ...s.get(), title: 'BC' }, { coalesce: 'k' });
    s.undo();
    expect(s.get().title).toBe('A');
    expect(s.canUndo()).toBe(false);
  });
  it('tracks dirty state against the last save; untouched new project is clean', () => {
    const s = createStore(init);
    expect(s.isDirty()).toBe(false);
    expect(s.isNew()).toBe(true);
    s.commit({ ...s.get(), title: 'B' });
    expect(s.isDirty()).toBe(true);
    s.markSaved();
    expect(s.isDirty()).toBe(false);
    s.undo();
    expect(s.isDirty()).toBe(true);
  });
});

describe('historical snapshots', () => {
  it('capture team logo version and do not follow later edits', () => {
    const team = { id: 't1', name: 'Team Spirit', shortName: 'TS', logoAssetId: 'logo-v1' };
    const other = { id: 't2', name: 'Liquid', shortName: '', logoAssetId: null };
    const match = { id: 'm1', teamAId: 't1', teamBId: 't2', format: 'BO3', status: 'completed', scoreA: 2, scoreB: 1, tournament: 'X' };
    const data = buildMatchData(match, { t1: team, t2: other });
    team.name = 'Renamed';
    team.logoAssetId = 'logo-v2';
    match.scoreA = 0;
    expect(data.teamA).toEqual({ teamId: 't1', name: 'Team Spirit', shortName: 'TS', logoAssetId: 'logo-v1' });
    expect(data.scoreA).toBe(2);
    expect(data.winner).toBe('A');
  });
  it('snapshotTeam handles a missing team', () => expect(snapshotTeam(null).name).toBe('TBD'));
  it('collects every *AssetId reference for garbage collection', () => {
    const refs = collectAssetRefs({ data: { teamA: { logoAssetId: 'a' }, picks: [{ portraitAssetId: 'b' }, null] }, style: { background: { assetId: 'c' }, player: { assetId: null } } });
    expect([...refs].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('utils', () => {
  it('deepMerge keeps nested defaults', () => expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 3 } })).toEqual({ a: { b: 3, c: 2 } }));
  it('setPath is immutable', () => {
    const o = { a: { b: 1 } };
    const n = setPath(o, 'a.b', 2);
    expect(o.a.b).toBe(1);
    expect(n.a.b).toBe(2);
  });
  it('search ignores case and ё', () => expect(matchesQuery('Ёжики Team', 'ежики')).toBe(true));
  it('slugify transliterates cyrillic', () => expect(slugify('Победа: Спирит vs Liquid')).toBe('pobeda-spirit-vs-liquid'));
  it('poster date styles', () => {
    expect(formatPosterDate('2026-10-13', 'dots')).toBe('13.10');
    expect(formatPosterDate('2026-10-13', 'en')).toBe('13 OCT');
    expect(formatPosterDate('2026-10-13', 'ru')).toBe('13 ОКТЯБРЯ');
  });
});
