import { createError, getRouterParam } from 'h3'
import { useDatabase } from '../../../utils/database'
import { findPandaScoreMatch, pandaScoreHttpError } from '../../../utils/providers/pandascore'
import { importPandaScoreMatch } from '../../../utils/pandascore-import'

export default defineEventHandler(async event => {
  const matchId = getRouterParam(event, 'id')!
  const source = useDatabase().prepare('SELECT external_id FROM external_entities WHERE provider = ? AND entity_type = ? AND local_id = ?').get('pandascore', 'match', matchId) as { external_id: string } | undefined
  if (!source) throw createError({ statusCode: 422, statusMessage: 'Матч не связан с PandaScore' })
  try {
    const config = useRuntimeConfig(event)
    const match = await findPandaScoreMatch(String(source.external_id), { token: String(config.pandascoreToken || ''), force: true })
    return await importPandaScoreMatch(match, { openDotaApiKey: String(config.opendotaApiKey || '') })
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause
    throw createError(pandaScoreHttpError(cause))
  }
})
