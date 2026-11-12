import { randomUUID } from 'node:crypto'
import { createError, readMultipartFormData } from 'h3'
import { useDatabase } from '../../utils/database'
import { MAX_IMAGE_BYTES, sniffImageType } from '../../utils/media'

export default defineEventHandler(async event => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  const kind = parts?.find(part => part.name === 'kind')?.data.toString() || 'image'
  if (!file?.data?.byteLength || !file.filename) throw createError({ statusCode: 400, statusMessage: 'Файл не передан' })
  if (file.data.byteLength > MAX_IMAGE_BYTES) throw createError({ statusCode: 413, statusMessage: 'Файл больше 12 МБ' })
  const mimeType = sniffImageType(file.data)
  if (!mimeType) throw createError({ statusCode: 415, statusMessage: 'Поддерживаются только PNG, JPEG, WebP, GIF и SVG' })
  const id = `asset_${randomUUID()}`
  useDatabase().prepare('INSERT INTO media(id,kind,mime_type,bytes,name,created_at) VALUES(?,?,?,?,?,?)').run(id, kind, mimeType, file.data, file.filename, new Date().toISOString())
  return { id, kind, mimeType, name: file.filename, url: `/api/media/${id}` }
})
