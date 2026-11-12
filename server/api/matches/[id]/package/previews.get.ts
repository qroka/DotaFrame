import { getQuery, getRouterParam } from 'h3'
import { getPackagePreviews } from '../../../../utils/pandascore-import'

export default defineEventHandler(event => getPackagePreviews(
  getRouterParam(event, 'id')!,
  getQuery(event).trackedTeamId ? String(getQuery(event).trackedTeamId) : null
))
