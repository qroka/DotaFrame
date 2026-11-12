import { createError } from 'h3'
import { fetchPandaScorePlayersByIds, pandaScoreHttpError, pandaScorePlayersImportSchema } from '../../../../utils/providers/pandascore'
import { importPandaScorePlayers } from '../../../../utils/pandascore-import'

/** Import PandaScore players into the local directory. Data is re-read from PandaScore, not trusted from the client. */
export default defineEventHandler(async event => {
  const body = pandaScorePlayersImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта игроков' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const players = await fetchPandaScorePlayersByIds([...new Set(body.data.externalIds)], options)
    if (!players.length) throw createError({ statusCode: 404, statusMessage: 'PandaScore не вернул выбранных игроков' })
    return await importPandaScorePlayers(players)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
