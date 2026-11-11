import { createError, getRouterParam } from 'h3'
import { z } from 'zod'
import { createPackageProjects } from '../../../utils/pandascore-import'

const schema = z.object({
  trackedTeamId: z.string().nullable().optional(), keys: z.array(z.string()).optional(), forceNewVersion: z.boolean().default(false)
})

export default defineEventHandler(async event => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || 'Некорректные параметры пакета' })
  return createPackageProjects(getRouterParam(event, 'id')!, parsed.data)
})
