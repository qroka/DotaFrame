import { repository } from '../../utils/repository'
export default defineEventHandler(() => repository.players.list())
