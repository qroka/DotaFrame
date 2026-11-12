import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.players.save(await readBody(event)))
