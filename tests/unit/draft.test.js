import { describe, it, expect } from 'vitest';
import { validateDraft, usedHeroIds, swapSides, heroLocation, draftFromSnapshot, MAX_BANS_PER_SIDE } from '../../src/domain/draft.js';

const match = { id: 'm1', teamAId: 'a', teamBId: 'b', format: 'BO3' };
const full = () => ({
  matchId: 'm1',
  mapNumber: 1,
  radiantTeamId: 'a',
  direTeamId: 'b',
  picksRadiant: [1, 2, 3, 4, 5],
  picksDire: [6, 7, 8, 9, 10],
  bansRadiant: [11, 12],
  bansDire: [13],
  winner: null,
});

describe('validateDraft', () => {
  it('accepts a complete unique draft', () => {
    const r = validateDraft(full(), match);
    expect(r.errors).toEqual([]);
    expect(r.complete).toBe(true);
  });

  it('DRAFT-01: map number must fit the format', () => {
    expect(validateDraft({ ...full(), mapNumber: 4 }, match).errors.length).toBe(1);
    expect(validateDraft({ ...full(), mapNumber: 5 }, { ...match, format: 'BO5' }).errors).toEqual([]);
    expect(validateDraft({ ...full(), mapNumber: 2 }, { ...match, format: 'BO1' }).errors.length).toBe(1);
  });

  it('DRAFT-02: sides must be the two different match teams', () => {
    expect(validateDraft({ ...full(), direTeamId: 'a' }, match).errors[0]).toMatch(/разными/);
    expect(validateDraft({ ...full(), direTeamId: 'zzz' }, match).errors[0]).toMatch(/участниками/);
    expect(validateDraft({ ...full(), radiantTeamId: '' }, match).errors.length).toBe(1);
  });

  it('DRAFT-03: incomplete picks are a warning, not an error', () => {
    const r = validateDraft({ ...full(), picksDire: [6, 7, null, null, null] }, match);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/2 из 5/);
    expect(r.complete).toBe(false);
  });

  it('DRAFT-04: variable bans, up to the maximum', () => {
    expect(validateDraft({ ...full(), bansRadiant: [], bansDire: [] }, match).complete).toBe(true);
    const many = Array.from({ length: MAX_BANS_PER_SIDE + 1 }, (_, i) => 100 + i);
    expect(validateDraft({ ...full(), bansRadiant: many }, match).errors.length).toBe(1);
  });

  it('DRAFT-05: a hero cannot repeat across picks and bans', () => {
    expect(validateDraft({ ...full(), bansDire: [1] }, match).errors[0]).toMatch(/несколько раз/);
    expect(validateDraft({ ...full(), picksDire: [6, 6, 8, 9, 10] }, match).complete).toBe(false);
  });

  it('requires a match', () => {
    expect(validateDraft(full(), null).errors.length).toBeGreaterThan(0);
  });
});

describe('draft helpers', () => {
  it('usedHeroIds ignores empty slots', () => {
    expect(usedHeroIds({ picksRadiant: [1, null], picksDire: [], bansRadiant: [3], bansDire: [] })).toEqual([1, 3]);
  });

  it('heroLocation finds where a hero is used', () => {
    expect(heroLocation(full(), 13)).toBe('bansDire');
    expect(heroLocation(full(), 999)).toBeNull();
  });

  it('swapSides swaps teams, picks, bans and winner', () => {
    const s = swapSides({ ...full(), winner: 'radiant' });
    expect(s.radiantTeamId).toBe('b');
    expect(s.picksRadiant).toEqual([6, 7, 8, 9, 10]);
    expect(s.bansDire).toEqual([11, 12]);
    expect(s.winner).toBe('dire');
  });

  it('draftFromSnapshot restores hero ids from a poster snapshot', () => {
    const snap = {
      draftId: 'd1',
      matchId: 'm1',
      mapNumber: 2,
      radiant: { teamId: 'a' },
      dire: { teamId: 'b' },
      picksRadiant: [{ heroId: 1 }, null, { heroId: 3 }],
      picksDire: [],
      bansRadiant: [{ heroId: 9 }],
      bansDire: [],
      mapWinner: 'dire',
    };
    const d = draftFromSnapshot(snap);
    expect(d.picksRadiant).toEqual([1, null, 3, null, null]);
    expect(d.picksDire).toEqual([null, null, null, null, null]);
    expect(d.bansRadiant).toEqual([9]);
    expect(d.winner).toBe('dire');
    expect(d.mapNumber).toBe(2);
  });
});
