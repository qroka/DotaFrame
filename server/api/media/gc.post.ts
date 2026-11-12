import { createError } from 'h3'
import { deleteOrphanMedia, findOrphanMedia } from '../../utils/media-gc'

/** Deletes unused images. Requires `{ confirm: true }`; only ids that are still orphans at this moment are removed. */
export default defineEventHandler(async event => {
  const body = await readBody(event) as { confirm?: boolean, ids?: string[] } | null
  if (body?.confirm !== true) throw createError({ statusCode: 400, statusMessage: 'Нужно подтверждение: confirm: true' })
  return deleteOrphanMedia(body.ids ?? findOrphanMedia().items.map(item => item.id))
})
