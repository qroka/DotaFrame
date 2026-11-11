import { createError, getQuery } from 'h3'
import { fetchPandaScoreMatches, pandaScoreHttpError, pandaScoreListStatusSchema } from '../../../utils/providers/pandascore'

export default defineEventHandler(async event => {
  const parsed = pandaScoreListStatusSchema.safeParse(getQuery(event).status || 'upcoming')
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Неизвестный список матчей' })
  try {
    const config = useRuntimeConfig(event)
    return { status: parsed.data, matches: await fetchPandaScoreMatches(parsed.data, { token: String(config.pandascoreToken || '') }) }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
