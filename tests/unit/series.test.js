import { describe, it, expect } from 'vitest';
import { validateScore, finalScores, validateMatch, winnerOf } from '../../src/domain/series';

describe('validateScore', () => {
  it('accepts valid BO3 final scores and finds the winner', () => {
    expect(validateScore('BO3', 'completed', 2, 1)).toMatchObject({ ok: true, winner: 'A' });
    expect(validateScore('BO3', 'completed', 0, 2)).toMatchObject({ ok: true, winner: 'B' });
  });
  it('rejects impossible BO3 results', () => {
    expect(validateScore('BO3', 'completed', 3, 0).ok).toBe(false);
    expect(validateScore('BO3', 'completed', 1, 1).ok).toBe(false);
    expect(validateScore('BO3', 'completed', 2, 2).ok).toBe(false);
  });
  it('supports a BO2 draw', () => {
    expect(validateScore('BO2', 'completed', 1, 1)).toMatchObject({ ok: true, winner: 'draw' });
    expect(validateScore('BO2', 'completed', 2, 0)).toMatchObject({ ok: true, winner: 'A' });
    expect(validateScore('BO2', 'completed', 1, 0).ok).toBe(false);
  });
  it('BO5 needs three wins', () => {
    expect(validateScore('BO5', 'completed', 3, 2)).toMatchObject({ ok: true, winner: 'A' });
    expect(validateScore('BO5', 'completed', 2, 2).ok).toBe(false);
    expect(validateScore('BO5', 'completed', 4, 1).ok).toBe(false);
  });
  it('BO1 is 1:0 or 0:1', () => {
    expect(finalScores('BO1')).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });
  it('live series cannot already be decided', () => {
    expect(validateScore('BO3', 'live', 1, 1).ok).toBe(true);
    expect(validateScore('BO3', 'live', 2, 0).ok).toBe(false);
  });
  it('scheduled series has no score', () => {
    expect(validateScore('BO3', 'scheduled', null, null).ok).toBe(true);
    expect(validateScore('BO3', 'scheduled', 1, 0).ok).toBe(false);
  });
  it('rejects negative and fractional values', () => {
    expect(validateScore('BO3', 'completed', -1, 2).ok).toBe(false);
    expect(validateScore('BO3', 'completed', 1.5, 2).ok).toBe(false);
  });
});

describe('finalScores', () => {
  it('lists all BO3 outcomes', () => {
    expect(finalScores('BO3')).toEqual([
      [2, 0],
      [2, 1],
      [1, 2],
      [0, 2],
    ]);
  });
  it('lists BO2 outcomes including the draw', () => {
    expect(finalScores('BO2')).toEqual([
      [2, 0],
      [1, 1],
      [0, 2],
    ]);
  });
});

describe('validateMatch', () => {
  const base = { teamAId: 'a', teamBId: 'b', format: 'BO3', status: 'scheduled', scoreA: null, scoreB: null };
  it('passes a valid scheduled match', () => expect(validateMatch(base)).toEqual({}));
  it('requires different teams', () => expect(validateMatch({ ...base, teamBId: 'a' }).teamBId).toBeTruthy());
  it('requires both teams', () => expect(validateMatch({ ...base, teamAId: '' }).teamAId).toBeTruthy());
  it('reports invalid scores', () => expect(validateMatch({ ...base, status: 'completed', scoreA: 3, scoreB: 0 }).score).toBeTruthy());
  it('winnerOf only for completed', () => {
    expect(winnerOf({ ...base, status: 'completed', scoreA: 1, scoreB: 2 })).toBe('B');
    expect(winnerOf({ ...base, status: 'live', scoreA: 1, scoreB: 0 })).toBe(null);
  });
});
