import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.leagues.save(await readBody(event)))
