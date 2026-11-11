import { getRouterParam } from 'h3'
import { repository } from '../../../utils/repository'
export default defineEventHandler(event => repository.projects.duplicate(getRouterParam(event, 'id')!))
