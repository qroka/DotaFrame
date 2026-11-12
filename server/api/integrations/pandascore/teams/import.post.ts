import { createError } from 'h3'
import { fetchPandaScoreTeamsByIds, pandaScoreHttpError, pandaScoreTeamsImportSchema } from '../../../../utils/providers/pandascore'
import { importPandaScoreTeams } from '../../../../utils/pandascore-import'

/** Import the given PandaScore teams into the local directory. Team data is re-read from PandaScore, not trusted from the client. */
export default defineEventHandler(async event => {
  const body = pandaScoreTeamsImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта команд' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const teams = await fetchPandaScoreTeamsByIds([...new Set(body.data.externalIds)], options)
    if (!teams.length) throw createError({ statusCode: 404, statusMessage: 'PandaScore не вернул выбранные команды' })
    return await importPandaScoreTeams(teams)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
