import { repository } from '../../utils/repository'
export default defineEventHandler(() => repository.teams.list())
