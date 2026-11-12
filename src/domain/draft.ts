/**
 * GameDraft rules (docs/requirements/draft-generator.md, DRAFT-01…05). Pure functions.
 * A draft: { matchId, mapNumber, radiantTeamId, direTeamId, picksRadiant[5], picksDire[5],
 *            bansRadiant[], bansDire[], winner: 'radiant'|'dire'|null }
 * Hero entries are hero ids (numbers) or null for an empty pick slot.
 */
import type { DraftPosterData, DraftRecord, MatchRecord } from '../types';
import { mapsInFormat } from './series';

export const PICKS_PER_SIDE = 5;
export const MAX_BANS_PER_SIDE = 10;

type HeroKey = 'picksRadiant' | 'picksDire' | 'bansRadiant' | 'bansDire';
const HERO_KEYS: HeroKey[] = ['picksRadiant', 'picksDire', 'bansRadiant', 'bansDire'];

const filled = <T>(arr: Array<T | null | undefined> | null | undefined): T[] => (arr ?? []).filter((v): v is T => v !== null && v !== undefined && (v as unknown) !== '');

/** All hero ids used in picks and bans (with duplicates). */
export function usedHeroIds(draft: Partial<DraftRecord> | null | undefined): Array<number | string> {
  return [...filled(draft?.picksRadiant), ...filled(draft?.picksDire), ...filled(draft?.bansRadiant), ...filled(draft?.bansDire)];
}

/** Where a hero is used on this map: 'picksRadiant' | 'picksDire' | 'bansRadiant' | 'bansDire' | null */
export function heroLocation(draft: Partial<DraftRecord> | null | undefined, heroId: number | string): HeroKey | null {
  for (const key of HERO_KEYS) {
    if ((draft?.[key] ?? []).some((v) => v !== null && v !== undefined && String(v) === String(heroId))) return key;
  }
  return null;
}

/** Swap Radiant and Dire (teams, picks, bans and map winner). */
export function swapSides<T extends Partial<DraftRecord>>(draft: T): T {
  const winner = draft.winner === 'radiant' ? 'dire' : draft.winner === 'dire' ? 'radiant' : (draft.winner ?? null);
  return {
    ...draft,
    radiantTeamId: draft.direTeamId,
    direTeamId: draft.radiantTeamId,
    picksRadiant: [...(draft.picksDire ?? [])],
    picksDire: [...(draft.picksRadiant ?? [])],
    bansRadiant: [...(draft.bansDire ?? [])],
    bansDire: [...(draft.bansRadiant ?? [])],
    winner,
  };
}

/**
 * Validate a draft against its series.
 * @returns {{ errors: string[], warnings: string[], complete: boolean }}
 *   errors   — the draft is inconsistent (duplicates, wrong teams/map, too many bans)
 *   warnings — the draft is valid but not finished (missing picks)
 *   complete — 5 + 5 unique picks and no errors: ready for a final poster
 */
export function validateDraft(draft: Partial<DraftRecord> | null | undefined, match: Partial<MatchRecord> | null | undefined): { errors: string[]; warnings: string[]; complete: boolean } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!draft) return { errors: ['Драфт не заполнен'], warnings, complete: false };

  if (!match) errors.push('Выберите матч для драфта');
  else {
    const games = mapsInFormat(match.format ?? '');
    const mapNumber = draft.mapNumber;
    if (!Number.isInteger(mapNumber) || mapNumber! < 1 || mapNumber! > games) {
      errors.push(`Номер карты должен быть от 1 до ${games} для ${match.format}`);
    }
    const teams = [match.teamAId, match.teamBId];
    if (!draft.radiantTeamId || !draft.direTeamId) errors.push('Назначьте команды Radiant и Dire');
    else if (draft.radiantTeamId === draft.direTeamId) errors.push('Radiant и Dire должны быть разными командами');
    else if (!teams.includes(draft.radiantTeamId) || !teams.includes(draft.direTeamId)) errors.push('Radiant и Dire должны быть участниками выбранного матча');
  }

  for (const [key, label] of [
    ['bansRadiant', 'Radiant'],
    ['bansDire', 'Dire'],
  ] as const) {
    if (filled(draft[key]).length > MAX_BANS_PER_SIDE) errors.push(`У ${label} больше ${MAX_BANS_PER_SIDE} банов`);
  }
  for (const [key, label] of [
    ['picksRadiant', 'Radiant'],
    ['picksDire', 'Dire'],
  ] as const) {
    if (filled(draft[key]).length > PICKS_PER_SIDE) errors.push(`У ${label} больше ${PICKS_PER_SIDE} пиков`);
  }

  const used = usedHeroIds(draft).map(String);
  const dupes = [...new Set(used.filter((id, i) => used.indexOf(id) !== i))];
  if (dupes.length) errors.push(`Герой встречается в драфте несколько раз (${dupes.length === 1 ? '1 герой' : `${dupes.length} героев`}) — каждый герой может быть выбран или забанен только один раз`);

  const pr = filled(draft.picksRadiant).length;
  const pd = filled(draft.picksDire).length;
  if (pr < PICKS_PER_SIDE) warnings.push(`Radiant: выбрано ${pr} из ${PICKS_PER_SIDE} героев`);
  if (pd < PICKS_PER_SIDE) warnings.push(`Dire: выбрано ${pd} из ${PICKS_PER_SIDE} героев`);

  return { errors, warnings, complete: errors.length === 0 && pr === PICKS_PER_SIDE && pd === PICKS_PER_SIDE };
}

/** Convert a draft snapshot (poster data) back to a working GameDraft (hero ids). */
export function draftFromSnapshot(data: Partial<DraftPosterData> | null | undefined): DraftRecord & { id: string | null; matchId: string | null; radiantTeamId: string; direTeamId: string } {
  const ids = (list: DraftPosterData['picksRadiant'] | undefined, fixed?: number): Array<number | string | null> => {
    const out: Array<number | string | null> = (list ?? []).map((h) => (h ? h.heroId : null));
    if (fixed) while (out.length < fixed) out.push(null);
    return fixed ? out.slice(0, fixed) : out.filter((v) => v !== null);
  };
  return {
    id: data?.draftId ?? null,
    matchId: data?.matchId ?? null,
    mapNumber: data?.mapNumber ?? 1,
    radiantTeamId: data?.radiant?.teamId ?? '',
    direTeamId: data?.dire?.teamId ?? '',
    picksRadiant: ids(data?.picksRadiant, PICKS_PER_SIDE),
    picksDire: ids(data?.picksDire, PICKS_PER_SIDE),
    bansRadiant: ids(data?.bansRadiant),
    bansDire: ids(data?.bansDire),
    winner: (data?.mapWinner as 'radiant' | 'dire' | null | undefined) ?? null,
  };
}

export const isDraftEmpty = (draft: Partial<DraftRecord> | null | undefined): boolean => usedHeroIds(draft).length === 0;
