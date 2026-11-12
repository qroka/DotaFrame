import { listProjectSummaries } from '../utils/project-summaries'
import { repository } from '../utils/repository'

export default defineEventHandler(() => ({
  teams: repository.teams.list(),
  leagues: repository.leagues.list(),
  tournaments: repository.tournaments.list(),
  stages: repository.stages.list(),
  players: repository.players.list(),
  matches: repository.matches.list(),
  projects: listProjectSummaries()
}))
