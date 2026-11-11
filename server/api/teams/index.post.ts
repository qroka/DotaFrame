import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.teams.save(await readBody(event)))
