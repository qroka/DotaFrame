import { getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(async event => ({ value: repository.settings.set(getRouterParam(event, 'key')!, (await readBody(event)).value) }))
