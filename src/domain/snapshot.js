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
import { winnerOf } from './series.js';

export function snapshotTeam(team) {
  if (!team) return { teamId: null, name: 'TBD', shortName: '', logoAssetId: null };
  return { teamId: team.id, name: team.name, shortName: team.shortName ?? '', logoAssetId: team.logoAssetId ?? null };
}

export function snapshotMatch(match, teamsById) {
  return {
    matchId: match.id,
    teamA: snapshotTeam(teamsById[match.teamAId]),
    teamB: snapshotTeam(teamsById[match.teamBId]),
    tournament: match.tournament ?? '',
    stage: match.stage ?? '',
    startDate: match.startDate ?? '',
    startTime: match.startTime ?? '',
    timezone: match.timezone ?? '',
    format: match.format,
    status: match.status,
    scoreA: match.scoreA ?? null,
    scoreB: match.scoreB ?? null,
    winner: winnerOf(match),
  };
}

/** "Our team" for WIN/LOSE defaults to the winner (WIN) or the loser (LOSE). */
export function defaultPerspective(match, templateType) {
  const w = winnerOf(match);
  if (templateType === 'lose') return w === 'A' ? 'B' : 'A';
  return w === 'B' ? 'B' : 'A';
}

export function buildMatchData(match, teamsById, { texts = {}, perspective = 'A' } = {}) {
  return { kind: 'match', ...snapshotMatch(match, teamsById), perspective, texts, capturedAt: nowIso() };
}

/** Manual matchday row (not linked to a saved match). */
export function manualMatchItem(teamA, teamB, extra = {}) {
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

export function buildMatchesData(matchesList, teamsById, { texts = {}, date = '' } = {}) {
  return {
    kind: 'matches',
    items: matchesList.map((m) => snapshotMatch(m, teamsById)),
    date: date || matchesList[0]?.startDate || '',
    texts,
    capturedAt: nowIso(),
  };
}

export function snapshotHero(heroId, heroesById, portraits) {
  if (!heroId) return null;
  const hero = heroesById[heroId];
  if (!hero) return { heroId, name: String(heroId), slug: '', attr: '', portraitAssetId: null };
  return { heroId: hero.id, name: hero.name, slug: hero.slug, attr: hero.attr, portraitAssetId: portraits[hero.id] ?? null };
}

export function buildDraftData(match, draft, teamsById, heroesById, portraits, { texts = {} } = {}) {
  const base = snapshotMatch(match, teamsById);
  const hero = (id) => snapshotHero(id, heroesById, portraits);
  return {
    kind: 'draft',
    ...base,
    draftId: draft.id ?? null,
    mapNumber: draft.mapNumber,
    radiant: snapshotTeam(teamsById[draft.radiantTeamId]),
    dire: snapshotTeam(teamsById[draft.direTeamId]),
    picksRadiant: (draft.picksRadiant ?? []).map(hero),
    picksDire: (draft.picksDire ?? []).map(hero),
    bansRadiant: (draft.bansRadiant ?? []).map(hero).filter(Boolean),
    bansDire: (draft.bansDire ?? []).map(hero).filter(Boolean),
    mapWinner: draft.winner ?? null,
    perspective: 'A',
    texts,
    capturedAt: nowIso(),
  };
}

/** Demo data for the template gallery (clearly fictional, never saved as real results). */
export function sampleData(source, texts = {}) {
  const teamA = { teamId: 'demo-a', name: 'Team Alpha', shortName: 'ALP', logoAssetId: null };
  const teamB = { teamId: 'demo-b', name: 'Example Gaming', shortName: 'EXG', logoAssetId: null };
  const match = {
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
    const t = (name, short) => ({ teamId: null, name, shortName: short, logoAssetId: null });
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
    const empty = [null, null, null, null, null];
    return { kind: 'draft', ...match, mapNumber: 1, radiant: teamA, dire: teamB, picksRadiant: empty, picksDire: empty, bansRadiant: [], bansDire: [], mapWinner: null, perspective: 'A', texts };
  }
  return { kind: 'match', ...match, perspective: 'A', texts };
}
