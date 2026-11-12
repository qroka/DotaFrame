import { createError, getQuery } from 'h3'
import { fetchActivePandaScoreTeams, pandaScoreHttpError, pandaScoreTeamsQuerySchema, searchPandaScoreTeams } from '../../../../utils/providers/pandascore'
import { findLocalTeamForPandaScore } from '../../../../utils/pandascore-import'

/** Without `search` returns teams from live and upcoming matches; with it searches the PandaScore catalogue. */
export default defineEventHandler(async event => {
  const parsed = pandaScoreTeamsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Некорректный поисковый запрос' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const { search } = parsed.data
    const teams = search ? await searchPandaScoreTeams(search, options) : await fetchActivePandaScoreTeams(options)
    return {
      source: search ? 'search' : 'active',
      teams: teams.map(team => ({ ...team, localTeamId: findLocalTeamForPandaScore(team.externalId, team.name) }))
    }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
