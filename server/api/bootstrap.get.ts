import { repository } from '../utils/repository'

export default defineEventHandler(() => ({
  teams: repository.teams.list(),
  tournaments: repository.tournaments.list(),
  matches: repository.matches.list(),
  projects: repository.projects.list()
}))
