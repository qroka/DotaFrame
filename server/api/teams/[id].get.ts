import { createError, getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(event => repository.teams.get(getRouterParam(event, 'id')!) || (() => { throw createError({ statusCode: 404, statusMessage: 'Команда не найдена' }) })())
