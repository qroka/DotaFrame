import { getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(event => ({ value: repository.settings.get(getRouterParam(event, 'key')!) }))
