import { repository } from '../../utils/repository'
export default defineEventHandler(async event => repository.heroImages.save(await readBody(event)))
