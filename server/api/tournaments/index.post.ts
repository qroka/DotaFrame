import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.tournaments.save(await readBody(event)))
