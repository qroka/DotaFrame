import { repository } from '../../utils/repository'
export default defineEventHandler(async event => { const body = await readBody(event); return repository.projects.save(body.project ?? body, body.note ?? '') })
