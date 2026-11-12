import { createError } from 'h3'
import { fetchPandaScoreTournamentsByIds, pandaScoreHttpError, pandaScoreTournamentsImportSchema } from '../../../../utils/providers/pandascore'
import { importPandaScoreTournaments } from '../../../../utils/pandascore-import'

/** Import PandaScore tournaments into the local directory. Data is re-read from PandaScore, not trusted from the client. */
export default defineEventHandler(async event => {
  const body = pandaScoreTournamentsImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта турниров' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const tournaments = await fetchPandaScoreTournamentsByIds([...new Set(body.data.externalIds)], options)
    if (!tournaments.length) throw createError({ statusCode: 404, statusMessage: 'PandaScore не вернул выбранные турниры' })
    return await importPandaScoreTournaments(tournaments)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
