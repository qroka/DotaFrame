import { getQuery, getRouterParam } from 'h3'
import { getPublicationPackage } from '../../../utils/pandascore-import'

export default defineEventHandler(event => getPublicationPackage(
  getRouterParam(event, 'id')!,
  getQuery(event).trackedTeamId ? String(getQuery(event).trackedTeamId) : null
))
