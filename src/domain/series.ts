/**
 * Series rules: formats, statuses and result validation.
 * Pure functions — covered by unit tests (tests/unit/series.test.js).
 */
import type { MatchRecord, SeriesWinner } from '../types';

export interface SeriesFormat { id: string; label: string; games: number; winsNeeded: number; allowDraw: boolean; long: string }

export const FORMATS: Record<string, SeriesFormat> = {
  BO1: { id: 'BO1', label: 'BO1', games: 1, winsNeeded: 1, allowDraw: false, long: 'Best of 1' },
  BO2: { id: 'BO2', label: 'BO2', games: 2, winsNeeded: 2, allowDraw: true, long: 'Best of 2' },
  BO3: { id: 'BO3', label: 'BO3', games: 3, winsNeeded: 2, allowDraw: false, long: 'Best of 3' },
  BO5: { id: 'BO5', label: 'BO5', games: 5, winsNeeded: 3, allowDraw: false, long: 'Best of 5' },
};

export const FORMAT_IDS = Object.keys(FORMATS);

export const STATUSES: Record<string, { id: string; label: string }> = {
  scheduled: { id: 'scheduled', label: 'Запланирован' },
  live: { id: 'live', label: 'Идёт' },
  completed: { id: 'completed', label: 'Завершён' },
  cancelled: { id: 'cancelled', label: 'Отменён' },
};

type Score = number | string | null | undefined;
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const present = (v: unknown) => v !== null && v !== undefined && v !== '';

/**
 * Validate a score for a given format/status.
 */
export function validateScore(format: string, status: string, scoreA: Score, scoreB: Score): { ok: boolean; errors: string[]; winner: SeriesWinner } {
  const f = FORMATS[format];
  const errors: string[] = [];
  if (!f) return { ok: false, errors: ['Неизвестный формат серии'], winner: null };

  const hasA = present(scoreA);
  const hasB = present(scoreB);

  if (status === 'scheduled' || status === 'cancelled') {
    if ((hasA && scoreA !== 0) || (hasB && scoreB !== 0)) {
      errors.push(status === 'scheduled' ? 'У запланированного матча не может быть счёта' : 'У отменённого матча не указывается счёт');
    }
    return { ok: errors.length === 0, errors, winner: null };
  }

  if (!hasA || !hasB) {
    errors.push('Укажите счёт обеих команд');
    return { ok: false, errors, winner: null };
  }
  if (!isInt(scoreA) || !isInt(scoreB)) {
    errors.push('Счёт должен быть целым неотрицательным числом');
    return { ok: false, errors, winner: null };
  }

  const total = scoreA + scoreB;
  if (scoreA > f.winsNeeded || scoreB > f.winsNeeded) errors.push(`В ${f.label} нельзя выиграть больше ${f.winsNeeded} карт`);
  if (total > f.games) errors.push(`В ${f.label} не больше ${f.games} карт`);

  if (status === 'live') {
    if (errors.length === 0) {
      if (!f.allowDraw && (scoreA >= f.winsNeeded || scoreB >= f.winsNeeded)) errors.push('Серия с таким счётом уже завершена — смените статус на «Завершён»');
      if (f.allowDraw && total >= f.games) errors.push('Все карты сыграны — смените статус на «Завершён»');
    }
    return { ok: errors.length === 0, errors, winner: null };
  }

  // completed
  let winner: SeriesWinner = null;
  if (errors.length === 0) {
    if (f.allowDraw) {
      if (total !== f.games) errors.push(`В ${f.label} должны быть сыграны обе карты (2:0, 1:1 или 0:2)`);
      else winner = scoreA === scoreB ? 'draw' : scoreA > scoreB ? 'A' : 'B';
    } else if (scoreA === f.winsNeeded && scoreB < f.winsNeeded) winner = 'A';
    else if (scoreB === f.winsNeeded && scoreA < f.winsNeeded) winner = 'B';
    else errors.push(`Для завершения ${f.label} одна команда должна выиграть ${f.winsNeeded} ${f.winsNeeded === 1 ? 'карту' : 'карты'}`);
  }
  return { ok: errors.length === 0, errors, winner };
}

/** All valid final scores for a format, e.g. BO3 → [[2,0],[2,1],[1,2],[0,2]]. */
export function finalScores(format: string): Array<[number, number]> {
  const f = FORMATS[format];
  if (!f) return [];
  const out: Array<[number, number]> = [];
  for (let a = f.winsNeeded; a >= 0; a--)
    for (let b = 0; b <= f.winsNeeded; b++) if (validateScore(format, 'completed', a, b).ok) out.push([a, b]);
  return out;
}

export function winnerOf(match: Pick<MatchRecord, 'status' | 'format' | 'scoreA' | 'scoreB'> | null | undefined): SeriesWinner {
  if (!match || match.status !== 'completed') return null;
  return validateScore(match.format, 'completed', match.scoreA, match.scoreB).winner;
}

/** Validate a whole match record. Returns a field → message map (empty = valid). */
export function validateMatch(m: Partial<MatchRecord>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!m.teamAId) errors.teamAId = 'Выберите первую команду';
  if (!m.teamBId) errors.teamBId = 'Выберите вторую команду';
  if (m.teamAId && m.teamBId && m.teamAId === m.teamBId) errors.teamBId = 'Команды должны быть разными';
  if (!FORMATS[m.format ?? '']) errors.format = 'Выберите формат';
  if (!STATUSES[m.status ?? '']) errors.status = 'Выберите статус';
  if (m.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(m.startDate)) errors.startDate = 'Неверная дата';
  if (m.startTime && !/^\d{2}:\d{2}$/.test(m.startTime)) errors.startTime = 'Неверное время';
  if ((m.tournament ?? '').length > 120) errors.tournament = 'Не больше 120 символов';
  if ((m.stage ?? '').length > 80) errors.stage = 'Не больше 80 символов';
  const score = validateScore(m.format ?? '', m.status ?? '', m.scoreA, m.scoreB);
  if (!score.ok) errors.score = score.errors[0]!;
  return errors;
}

/** Number of maps that can exist in a series (for draft map selection). */
export const mapsInFormat = (format: string): number => FORMATS[format]?.games ?? 1;

export function scoreLabel(m: Pick<MatchRecord, 'scoreA' | 'scoreB'> | null | undefined, sep = ':'): string {
  if (!m || !present(m.scoreA) || !present(m.scoreB)) return '';
  return `${m.scoreA}${sep}${m.scoreB}`;
}
