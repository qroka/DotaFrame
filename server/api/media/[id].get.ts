import { createError, getRouterParam, setHeader } from 'h3'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(event => {
  const row = useDatabase().prepare('SELECT mime_type, bytes, name FROM media WHERE id = ?').get(getRouterParam(event, 'id')!) as { mime_type: string, bytes: Uint8Array, name: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Изображение не найдено' })
  setHeader(event, 'Content-Type', row.mime_type)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return row.bytes
})
