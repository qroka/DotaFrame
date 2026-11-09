/**
 * Creating projects and converting data between template sources.
 * Keeps the editor free of snapshot-building details.
 */
import { teams as teamsRepo, matches as matchesRepo, drafts as draftsRepo, emptyDraft, settings as settingsRepo, projects as projectsRepo } from '../data/repos.js';
import { portraitMap } from '../data/heroPortraits.js';
import { buildMatchData, buildMatchesData, buildDraftData, defaultPerspective, snapshotTeam } from '../domain/snapshot.js';
import { getTemplate, defaultStyle, defaultTexts, normalizeStyle, TEMPLATE_TYPES } from '../templates/index.js';
import { deepMerge } from '../core/utils.js';
import { nowIso } from '../core/ids.js';

let heroesModule = null;
async function heroesById() {
  try {
    heroesModule ??= await import('../data/heroes.js');
    return heroesModule.HEROES_BY_ID ?? {};
  } catch {
    return {};
  }
}

export async function loadLookups() {
  const [teams, matches] = await Promise.all([teamsRepo.list(), matchesRepo.list()]);
  return { teams, matches, teamsById: Object.fromEntries(teams.map((t) => [t.id, t])) };
}

function blankMatchData(texts) {
  return {
    kind: 'match',
    matchId: null,
    teamA: snapshotTeam(null),
    teamB: snapshotTeam(null),
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
    perspective: 'A',
    texts,
    capturedAt: nowIso(),
  };
}

/** Build the data snapshot a template needs from a match id / list of ids. */
export async function buildData(tpl, { matchId = null, matchIds = [], texts, lookups, mapNumber = 1 } = {}) {
  const { matches, teamsById } = lookups;
  const t = texts ?? defaultTexts(tpl);
  const find = (id) => matches.find((m) => m.id === id);
  if (tpl.source === 'matches') {
    const list = matchIds.map(find).filter(Boolean);
    return buildMatchesData(list, teamsById, { texts: t });
  }
  const match = find(matchId);
  if (tpl.source === 'draft') {
    if (!match) return { ...blankMatchData(t), kind: 'draft', draftId: null, mapNumber: 1, radiant: snapshotTeam(null), dire: snapshotTeam(null), picksRadiant: [null, null, null, null, null], picksDire: [null, null, null, null, null], bansRadiant: [], bansDire: [], mapWinner: null };
    const stored = await draftsRepo.find(match.id, mapNumber);
    const draft = stored ?? emptyDraft(match, mapNumber);
    return buildDraftData(match, draft, teamsById, await heroesById(), await portraitMap(), { texts: t });
  }
  if (!match) return blankMatchData(t);
  return buildMatchData(match, teamsById, { texts: t, perspective: defaultPerspective(match, tpl.type) });
}

export function autoTitle(tpl, data) {
  const type = TEMPLATE_TYPES[tpl.type] ?? tpl.name;
  if (tpl.source === 'matches') {
    const n = data.items?.length ?? 0;
    return `${type}${data.date ? ` ${data.date.split('-').reverse().slice(0, 2).join('.')}` : ''}${n ? ` · ${n} матч.` : ''}`;
  }
  if (data.teamA?.teamId || data.teamB?.teamId) {
    const suffix = tpl.source === 'draft' ? ` · карта ${data.mapNumber}` : '';
    return `${type}: ${data.teamA?.name} vs ${data.teamB?.name}${suffix}`;
  }
  return `${type} — без матча`;
}

/** Fresh unsaved project state for the editor. */
export async function newProjectState({ templateId, matchId, matchIds = [], lookups }) {
  const tpl = getTemplate(templateId) ?? getTemplate('match-announcement');
  const data = await buildData(tpl, { matchId, matchIds, lookups });
  const savedSocials = await settingsRepo.get('defaults.socials', null).catch(() => null);
  const style = savedSocials ? deepMerge(defaultStyle(tpl), { socials: savedSocials }) : defaultStyle(tpl);
  return {
    id: null,
    title: autoTitle(tpl, data),
    templateId: tpl.id,
    templateVersion: tpl.version,
    matchId: matchId ?? (tpl.source === 'matches' ? null : data.matchId ?? null),
    data,
    style,
    size: tpl.exportSizes[0].id,
    createdAt: null,
    thumbnailAssetId: null,
  };
}

/**
 * Switch template keeping as much as possible: same-source data is kept (texts that
 * still equal the old defaults are replaced by the new defaults), style is merged.
 */
export async function switchTemplateState(state, nextId, lookups) {
  const from = getTemplate(state.templateId, state.templateVersion);
  const to = getTemplate(nextId);
  if (!to) return state;
  const oldDefaults = defaultTexts(from);
  const newDefaults = defaultTexts(to);
  const texts = { ...newDefaults };
  for (const [k, v] of Object.entries(state.data.texts ?? {})) {
    if (k in newDefaults && v !== oldDefaults[k]) texts[k] = v;
  }

  let data;
  if (from.source === to.source) {
    data = { ...state.data, texts };
    if (to.source === 'match' && data.matchId && (to.type === 'win' || to.type === 'lose')) {
      const m = lookups.matches.find((x) => x.id === data.matchId);
      if (m && m.status === 'completed') data.perspective = defaultPerspective(m, to.type);
    }
  } else if (to.source === 'matches') {
    const ids = state.data.matchId ? [state.data.matchId] : [];
    data = await buildData(to, { matchIds: ids, texts, lookups });
    if (!ids.length && state.data.kind !== 'matches' && state.data.teamA?.teamId) data.items = [stripToItem(state.data)];
  } else {
    const matchId = state.data.matchId ?? state.data.items?.find((i) => i.matchId)?.matchId ?? null;
    data = await buildData(to, { matchId, texts, lookups });
  }

  const sameSizeAvailable = to.exportSizes.some((s) => s.id === state.size);
  return {
    ...state,
    templateId: to.id,
    templateVersion: to.version,
    data,
    style: normalizeStyle(to, state.style),
    size: sameSizeAvailable ? state.size : to.exportSizes[0].id,
    title: state.title === autoTitle(from, state.data) ? autoTitle(to, data) : state.title,
  };
}

function stripToItem(d) {
  const { kind, texts, perspective, capturedAt, ...rest } = d;
  return rest;
}

export async function duplicateProject(id) {
  const p = await projectsRepo.get(id);
  if (!p) throw new Error('Публикация не найдена');
  const copy = { ...structuredClone(p), id: null, createdAt: null, title: `${p.title} (копия)` };
  return projectsRepo.save(copy, { note: `Копия «${p.title}»` });
}
