import { createError, getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(event => repository.projects.get(getRouterParam(event, 'id')!) || (() => { throw createError({ statusCode: 404, statusMessage: 'Публикация не найдена' }) })())
