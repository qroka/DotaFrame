import { createError } from 'h3'
import { findPandaScoreMatch, pandaScoreHttpError, pandaScoreImportSchema } from '../../../utils/providers/pandascore'
import { importPandaScoreMatch } from '../../../utils/pandascore-import'

export default defineEventHandler(async event => {
  const body = pandaScoreImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта' })
  try {
    const config = useRuntimeConfig(event)
    const match = await findPandaScoreMatch(body.data.externalMatchId, { token: String(config.pandascoreToken || ''), force: true })
    return await importPandaScoreMatch(match, { teamMappings: body.data.teamMappings, openDotaApiKey: String(config.opendotaApiKey || '') })
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
