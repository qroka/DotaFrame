import { repository } from '../../utils/repository'
export default defineEventHandler(() => repository.stages.list())
