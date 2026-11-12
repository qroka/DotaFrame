/**
 * Snapshot builders: turn live entities (Team, Match, GameDraft, Hero) into the plain
 * JSON a poster renders from. A saved PosterProject renders ONLY from its snapshot,
 * so later edits to teams/matches/drafts never change historical posters.
 *
 * Snapshot shapes (by template.source):
 *  match:   { kind, matchId, teamA, teamB, tournament, stage, startDate, startTime, timezone,
 *             format, status, scoreA, scoreB, winner, perspective, texts, capturedAt }
 *  matches: { kind, items: [matchSnapshot…], date, texts, capturedAt }
 *  draft:   { …match fields, kind, draftId, mapNumber, radiant, dire,
 *             picksRadiant, picksDire, bansRadiant, bansDire, mapWinner }
 *  team:    { teamId, name, shortName, logoAssetId }   ← logoAssetId = immutable version
 *  hero:    { heroId, name, slug, attr, portraitAssetId } | null
 */
import { nowIso } from '../core/ids';
import type {
  DraftPosterData, DraftRecord, Hero, HeroSnapshot, MatchPosterData, MatchRecord, MatchSnapshot, MatchesPosterData,
  PosterSource, PosterTexts, Side, TeamRecord, TeamSnapshot,
} from '../types';
import { winnerOf } from './series';

type TeamsById = Record<string, TeamRecord | undefined>;
type MatchLike = Pick<MatchRecord, 'status' | 'format' | 'scoreA' | 'scoreB'> & Partial<MatchRecord>;
/** Hero id → current portrait asset id. */
export type Portraits = Record<string | number, string | null | undefined>;

export function snapshotTeam(team: TeamRecord | null | undefined): TeamSnapshot {
  if (!team) return { teamId: null, name: 'TBD', shortName: '', logoAssetId: null };
  return { teamId: team.id, name: team.name, shortName: team.shortName ?? '', logoAssetId: team.logoAssetId ?? null };
}

export function snapshotMatch(match: MatchLike, teamsById: TeamsById): MatchSnapshot {
  return {
    matchId: match.id ?? null,
    teamA: snapshotTeam(teamsById[match.teamAId ?? '']),
    teamB: snapshotTeam(teamsById[match.teamBId ?? '']),
    tournament: match.tournament ?? '',
    stage: match.stage ?? '',
    startDate: match.startDate ?? '',
    startTime: match.startTime ?? '',
    timezone: match.timezone ?? '',
    format: match.format,
    status: match.status,
    scoreA: (match.scoreA as number | null | undefined) ?? null,
    scoreB: (match.scoreB as number | null | undefined) ?? null,
    winner: winnerOf(match),
  };
}

/** "Our team" for WIN/LOSE defaults to the winner (WIN) or the loser (LOSE). */
export function defaultPerspective(match: MatchLike, templateType: string): Side {
  const w = winnerOf(match);
  if (templateType === 'lose') return w === 'A' ? 'B' : 'A';
  return w === 'B' ? 'B' : 'A';
}

export function buildMatchData(match: MatchLike, teamsById: TeamsById, { texts = {}, perspective = 'A' }: { texts?: PosterTexts; perspective?: Side } = {}): MatchPosterData {
  return { kind: 'match', ...snapshotMatch(match, teamsById), perspective, texts, capturedAt: nowIso() };
}

/** Manual matchday row (not linked to a saved match). */
export function manualMatchItem(teamA: TeamRecord | null | undefined, teamB: TeamRecord | null | undefined, extra: Partial<MatchSnapshot> = {}): MatchSnapshot {
  return {
    matchId: null,
    teamA: snapshotTeam(teamA),
    teamB: snapshotTeam(teamB),
    tournament: '',
    stage: '',
    startDate: '',
    startTime: '',
    timezone: '',
    format: 'BO3',
    status: 'scheduled',
    scoreA: null,
    scoreB: null,
    winner: null,
    ...extra,
  };
}

export function buildMatchesData(matchesList: MatchLike[], teamsById: TeamsById, { texts = {}, date = '' }: { texts?: PosterTexts; date?: string } = {}): MatchesPosterData {
  return {
    kind: 'matches',
    items: matchesList.map((m) => snapshotMatch(m, teamsById)),
    date: date || matchesList[0]?.startDate || '',
    texts,
    capturedAt: nowIso(),
  };
}

export function snapshotHero(heroId: number | string | null | undefined, heroesById: Record<string | number, Hero | undefined>, portraits: Portraits): HeroSnapshot | null {
  if (!heroId) return null;
  const hero = heroesById[heroId];
  if (!hero) return { heroId, name: String(heroId), slug: '', attr: '', portraitAssetId: null };
  return { heroId: hero.id, name: hero.name, slug: hero.slug, attr: hero.attr, portraitAssetId: portraits[hero.id] ?? null };
}

export function buildDraftData(match: MatchLike, draft: DraftRecord, teamsById: TeamsById, heroesById: Record<string | number, Hero | undefined>, portraits: Portraits, { texts = {} }: { texts?: PosterTexts } = {}): DraftPosterData {
  const base = snapshotMatch(match, teamsById);
  const hero = (id: number | string | null | undefined) => snapshotHero(id, heroesById, portraits);
  return {
    kind: 'draft',
    ...base,
    draftId: draft.id ?? null,
    mapNumber: draft.mapNumber,
    radiant: snapshotTeam(teamsById[draft.radiantTeamId ?? '']),
    dire: snapshotTeam(teamsById[draft.direTeamId ?? '']),
    picksRadiant: (draft.picksRadiant ?? []).map(hero),
    picksDire: (draft.picksDire ?? []).map(hero),
    bansRadiant: (draft.bansRadiant ?? []).map(hero).filter((h): h is HeroSnapshot => !!h),
    bansDire: (draft.bansDire ?? []).map(hero).filter((h): h is HeroSnapshot => !!h),
    mapWinner: draft.winner ?? null,
    perspective: 'A',
    texts,
    capturedAt: nowIso(),
  };
}

/** Demo data for the template gallery (clearly fictional, never saved as real results). */
export function sampleData(source: PosterSource | string, texts: PosterTexts = {}): MatchPosterData | MatchesPosterData | DraftPosterData {
  const teamA: TeamSnapshot = { teamId: 'demo-a', name: 'Team Alpha', shortName: 'ALP', logoAssetId: null };
  const teamB: TeamSnapshot = { teamId: 'demo-b', name: 'Example Gaming', shortName: 'EXG', logoAssetId: null };
  const match: MatchSnapshot = {
    matchId: null,
    teamA,
    teamB,
    tournament: 'Demo League',
    stage: 'Плей-офф',
    startDate: '2026-11-21',
    startTime: '18:00',
    timezone: 'Europe/Moscow',
    format: 'BO3',
    status: 'completed',
    scoreA: 2,
    scoreB: 1,
    winner: 'A',
  };
  if (source === 'matches') {
    const t = (name: string, short: string): TeamSnapshot => ({ teamId: null, name, shortName: short, logoAssetId: null });
    return {
      kind: 'matches',
      date: '2026-11-21',
      texts,
      items: [
        { ...match, status: 'scheduled', scoreA: null, scoreB: null, winner: null },
        { ...match, teamB: t('Northern Lights', 'NRL'), startTime: '20:30', status: 'scheduled', scoreA: null, scoreB: null, winner: null },
        { ...match, teamB: t('Desert Foxes', 'DFX'), startDate: '2026-11-22', startTime: '16:00', format: 'BO2', status: 'scheduled', scoreA: null, scoreB: null, winner: null },
      ],
    };
  }
  if (source === 'draft') {
    const empty: null[] = [null, null, null, null, null];
    return { kind: 'draft', ...match, mapNumber: 1, radiant: teamA, dire: teamB, picksRadiant: empty, picksDire: empty, bansRadiant: [], bansDire: [], mapWinner: null, perspective: 'A', texts };
  }
  return { kind: 'match', ...match, perspective: 'A', texts };
}
