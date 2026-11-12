import { createError, getRouterParam } from 'h3'
import { repository } from '../../utils/repository'
export default defineEventHandler(event => {
  const item = repository.leagues.get(getRouterParam(event, 'id')!)
  if (!item) throw createError({ statusCode: 404, statusMessage: 'Лига не найдена' })
  return item
})
