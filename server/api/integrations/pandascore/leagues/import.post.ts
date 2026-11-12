import { createError } from 'h3'
import { fetchPandaScoreLeaguesByIds, pandaScoreHttpError, pandaScoreLeaguesImportSchema } from '../../../../utils/providers/pandascore'
import { importPandaScoreLeagues } from '../../../../utils/pandascore-import'

/** Import PandaScore leagues into the local directory. Data is re-read from PandaScore, not trusted from the client. */
export default defineEventHandler(async event => {
  const body = pandaScoreLeaguesImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта лиг' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const leagues = await fetchPandaScoreLeaguesByIds([...new Set(body.data.externalIds)], options)
    if (!leagues.length) throw createError({ statusCode: 404, statusMessage: 'PandaScore не вернул выбранные лиги' })
    return await importPandaScoreLeagues(leagues)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
