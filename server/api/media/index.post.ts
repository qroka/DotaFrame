import { randomUUID } from 'node:crypto'
import { createError, readMultipartFormData } from 'h3'
import { useDatabase } from '../../utils/database'

const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])

export default defineEventHandler(async event => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  const kind = parts?.find(part => part.name === 'kind')?.data.toString() || 'image'
  if (!file?.data || !file.filename || !file.type) throw createError({ statusCode: 400, statusMessage: 'Файл не передан' })
  if (!allowed.has(file.type)) throw createError({ statusCode: 415, statusMessage: 'Неподдерживаемый формат изображения' })
  if (file.data.byteLength > 12 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Файл больше 12 МБ' })
  const id = `asset_${randomUUID()}`
  useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run(id, kind, file.type, file.data, file.filename, new Date().toISOString())
  return { id, kind, mimeType: file.type, name: file.filename, url: `/api/media/${id}` }
})
