import { createError, getQuery, setHeaders } from 'h3'
import { downloadPandaScoreLogo } from '../../../utils/pandascore-import'
import { mediaResponseHeaders } from '../../../utils/media'

export default defineEventHandler(async event => {
  const url = String(getQuery(event).url || '')
  if (!url) throw createError({ statusCode: 400, statusMessage: 'URL логотипа не передан' })
  try {
    const image = await downloadPandaScoreLogo(url)
    setHeaders(event, { ...mediaResponseHeaders(image.mimeType), 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' })
    return image.bytes
  } catch { throw createError({ statusCode: 404, statusMessage: 'Логотип недоступен' }) }
})
