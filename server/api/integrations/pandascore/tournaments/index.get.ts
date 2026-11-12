import { createError, getQuery } from 'h3'
import { fetchPandaScoreTournaments, pandaScoreHttpError, pandaScoreTournamentsQuerySchema } from '../../../../utils/providers/pandascore'
import { findLocalTournamentForPandaScore } from '../../../../utils/pandascore-import'

/** Running / upcoming / past PandaScore tournaments, or a search across all of them by name. */
export default defineEventHandler(async event => {
  const parsed = pandaScoreTournamentsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Некорректный запрос турниров' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const tournaments = await fetchPandaScoreTournaments(parsed.data.status, parsed.data.search, options)
    return {
      status: parsed.data.status,
      search: parsed.data.search,
      tournaments: tournaments.map(tournament => ({ ...tournament, localTournamentId: findLocalTournamentForPandaScore(tournament.externalId, tournament.name) }))
    }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
