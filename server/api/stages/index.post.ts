import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.stages.save(await readBody(event)))
