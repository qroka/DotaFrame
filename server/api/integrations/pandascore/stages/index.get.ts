import { createError, getQuery } from 'h3'
import { fetchPandaScoreStages, pandaScoreHttpError, pandaScoreStagesQuerySchema } from '../../../../utils/providers/pandascore'
import { findLocalStageForPandaScore } from '../../../../utils/pandascore-import'

/** Running / upcoming / past PandaScore tournaments (stages of a series), or a search by name. */
export default defineEventHandler(async event => {
  const parsed = pandaScoreStagesQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Некорректный запрос турниров' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const stages = await fetchPandaScoreStages(parsed.data.status, parsed.data.search, options)
    return { status: parsed.data.status, search: parsed.data.search, stages: stages.map(stage => ({ ...stage, localStageId: findLocalStageForPandaScore(stage.externalId) })) }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
