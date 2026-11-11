import { repository } from '../utils/repository'

export default defineEventHandler(() => ({
  teams: repository.teams.list(),
  matches: repository.matches.list(),
  projects: repository.projects.list()
}))
