import { api } from './api'
import { buildMatchData, buildMatchesData, buildDraftData, defaultPerspective, snapshotTeam } from '../../src/domain/snapshot.js'
import { getTemplate, defaultStyle, defaultTexts, normalizeStyle, TEMPLATE_TYPES } from '../../src/templates/index.js'
import { deepMerge } from '../../src/core/utils'
import type { Match, PosterProject, PosterTemplate, Team } from '~/types/dotaframe'

export interface Lookups { teams: Team[], matches: Match[], teamsById: Record<string, Team> }
const now = () => new Date().toISOString()

export async function loadLookups(): Promise<Lookups> {
  const data = await api.bootstrap()
  return { teams: data.teams, matches: data.matches, teamsById: Object.fromEntries(data.teams.map(team => [team.id, team])) }
}

function blankMatchData(texts: Record<string, string>) {
  return { kind: 'match', matchId: null, teamA: snapshotTeam(null), teamB: snapshotTeam(null), tournament: '', stage: '', startDate: '', startTime: '', timezone: '', format: 'BO3', status: 'scheduled', scoreA: null, scoreB: null, winner: null, perspective: 'A', texts, capturedAt: now() }
}

export async function buildData(tpl: PosterTemplate, options: { matchId?: string | null, matchIds?: string[], texts?: Record<string, string>, lookups: Lookups, mapNumber?: number }) {
  const { matchId = null, matchIds = [], lookups, mapNumber = 1 } = options
  const texts = options.texts ?? defaultTexts(tpl)
  const find = (key: string | null) => lookups.matches.find(match => match.id === key)
  if (tpl.source === 'matches') return buildMatchesData(matchIds.map(find).filter(Boolean), lookups.teamsById, { texts })
  const match = find(matchId)
  if (tpl.source === 'draft') {
    if (!match) return { ...blankMatchData(texts), kind: 'draft', draftId: null, mapNumber, radiant: snapshotTeam(null), dire: snapshotTeam(null), picksRadiant: [null, null, null, null, null], picksDire: [null, null, null, null, null], bansRadiant: [], bansDire: [], mapWinner: null }
    const draft = await api.drafts.find(match.id, mapNumber) ?? { id: null, matchId: match.id, mapNumber, radiantTeamId: match.teamAId, direTeamId: match.teamBId, picksRadiant: [null, null, null, null, null], picksDire: [null, null, null, null, null], bansRadiant: [], bansDire: [], winner: null, updatedAt: null }
    const heroes = await import('../../src/data/heroes.js').then(module => module.HEROES_BY_ID ?? {}).catch(() => ({}))
    return buildDraftData(match, draft, lookups.teamsById, heroes, {}, { texts })
  }
  if (!match) return blankMatchData(texts)
  return buildMatchData(match, lookups.teamsById, { texts, perspective: defaultPerspective(match, tpl.type) })
}

export function autoTitle(tpl: PosterTemplate, data: Record<string, any>) {
  const type = (TEMPLATE_TYPES as Record<string, string>)[tpl.type] ?? tpl.name
  if (tpl.source === 'matches') { const count = data.items?.length ?? 0; return `${type}${data.date ? ` ${data.date.split('-').reverse().slice(0, 2).join('.')}` : ''}${count ? ` · ${count} матч.` : ''}` }
  if (data.teamA?.teamId || data.teamB?.teamId) return `${type}: ${data.teamA?.name} vs ${data.teamB?.name}${tpl.source === 'draft' ? ` · карта ${data.mapNumber}` : ''}`
  return `${type} — без матча`
}

export async function newProjectState(options: { templateId?: string, matchId?: string | null, matchIds?: string[], mapNumber?: number, lookups: Lookups }): Promise<PosterProject> {
  const tpl = getTemplate(options.templateId) ?? getTemplate('match-announcement')
  const data = await buildData(tpl, { matchId: options.matchId, matchIds: options.matchIds, mapNumber: options.mapNumber ?? 1, lookups: options.lookups })
  const socials = await api.settings.get<Record<string, unknown> | null>('defaults.socials', null).catch(() => null)
  return { id: null, title: autoTitle(tpl, data as Record<string, any>), templateId: tpl.id, templateVersion: tpl.version, matchId: options.matchId ?? (tpl.source === 'matches' ? null : (data as Record<string, any>).matchId ?? null), data, style: socials ? deepMerge(defaultStyle(tpl), { socials }) : defaultStyle(tpl), size: tpl.exportSizes[0].id, createdAt: null, thumbnailAssetId: null }
}

export async function switchTemplateState(state: PosterProject, nextId: string, lookups: Lookups): Promise<PosterProject> {
  const from = getTemplate(state.templateId, state.templateVersion); const to = getTemplate(nextId)
  if (!to) return state
  const oldDefaults = defaultTexts(from); const newDefaults = defaultTexts(to); const texts = { ...newDefaults }
  for (const [key, value] of Object.entries(state.data.texts ?? {})) if (key in newDefaults && value !== oldDefaults[key]) texts[key] = value as string
  let data: Record<string, any>
  if (from.source === to.source) data = { ...state.data, texts }
  else if (to.source === 'matches') data = await buildData(to, { matchIds: state.data.matchId ? [state.data.matchId] : [], texts, lookups })
  else data = await buildData(to, { matchId: state.data.matchId ?? state.data.items?.find((item: any) => item.matchId)?.matchId ?? null, texts, lookups })
  return { ...state, templateId: to.id, templateVersion: to.version, data, style: normalizeStyle(to, state.style), size: to.exportSizes.some((size: any) => size.id === state.size) ? state.size : to.exportSizes[0].id, title: state.title === autoTitle(from, state.data) ? autoTitle(to, data) : state.title }
}
