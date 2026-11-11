import { getQuery } from 'h3'
import { repository } from '../../utils/repository'

export default defineEventHandler(event => {
  const query = getQuery(event); const matchId = String(query.matchId || '')
  if (!matchId) return []
  return query.mapNumber ? repository.drafts.find(matchId, Number(query.mapNumber)) : repository.drafts.list(matchId)
})
