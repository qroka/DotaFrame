import { getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(event => { repository.matches.remove(getRouterParam(event, 'id')!); return { ok: true } })
