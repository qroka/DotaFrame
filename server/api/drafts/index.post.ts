import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.drafts.save(await readBody(event)))
