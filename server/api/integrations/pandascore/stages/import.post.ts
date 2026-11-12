import { createError } from 'h3'
import { fetchPandaScoreStagesByIds, pandaScoreHttpError, pandaScoreStagesImportSchema } from '../../../../utils/providers/pandascore'
import { importPandaScoreStages } from '../../../../utils/pandascore-import'

/** Import PandaScore tournaments (stages) together with their series and league. Data is re-read from PandaScore. */
export default defineEventHandler(async event => {
  const body = pandaScoreStagesImportSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 422, statusMessage: body.error.issues[0]?.message || 'Некорректный запрос импорта турниров' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const stages = await fetchPandaScoreStagesByIds([...new Set(body.data.externalIds)], options)
    if (!stages.length) throw createError({ statusCode: 404, statusMessage: 'PandaScore не вернул выбранные турниры' })
    return await importPandaScoreStages(stages)
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
