import { createError, getQuery } from 'h3'
import { fetchPandaScoreLeagues, pandaScoreHttpError, pandaScoreLeaguesQuerySchema } from '../../../../utils/providers/pandascore'
import { findLocalLeagueForPandaScore } from '../../../../utils/pandascore-import'

/** Recently updated PandaScore leagues, or a search by name. */
export default defineEventHandler(async event => {
  const parsed = pandaScoreLeaguesQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Некорректный запрос лиг' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const leagues = await fetchPandaScoreLeagues(parsed.data.search, options)
    return { search: parsed.data.search, leagues: leagues.map(league => ({ ...league, localLeagueId: findLocalLeagueForPandaScore(league.externalId, league.name) })) }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
