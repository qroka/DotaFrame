import { repository } from '../../utils/repository'
export default defineEventHandler(() => repository.projects.list())
