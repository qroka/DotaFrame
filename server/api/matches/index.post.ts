import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.matches.save(await readBody(event)))
