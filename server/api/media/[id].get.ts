import { createError, getRouterParam, setHeaders } from 'h3'
import { useDatabase } from '../../utils/database'
import { mediaResponseHeaders } from '../../utils/media'

export default defineEventHandler(event => {
  const row = useDatabase().prepare('SELECT mime_type, bytes FROM media WHERE id = ?').get(getRouterParam(event, 'id')!) as { mime_type: string, bytes: Uint8Array } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Изображение не найдено' })
  setHeaders(event, { ...mediaResponseHeaders(row.mime_type), 'Cache-Control': 'public, max-age=31536000, immutable' })
  return row.bytes
})
