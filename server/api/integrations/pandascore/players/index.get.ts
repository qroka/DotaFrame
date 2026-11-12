import { createError, getQuery } from 'h3'
import { fetchPandaScorePlayersByTeams, pandaScoreHttpError, pandaScorePlayersQuerySchema, searchPandaScorePlayers } from '../../../../utils/providers/pandascore'
import { findLocalPlayerForPandaScore, localTeamIdForPandaScore } from '../../../../utils/pandascore-import'
import { useDatabase } from '../../../../utils/database'

/** Without `search`: current rosters of directory teams linked to PandaScore. With it: catalogue search by nickname. */
export default defineEventHandler(async event => {
  const parsed = pandaScorePlayersQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Некорректный поисковый запрос' })
  try {
    const options = { token: String(useRuntimeConfig(event).pandascoreToken || '') }
    const { search } = parsed.data
    let linkedTeams = 0
    let players
    if (search) players = await searchPandaScorePlayers(search, options)
    else {
      const teamIds = (useDatabase().prepare("SELECT external_id FROM external_entities WHERE provider = 'pandascore' AND entity_type = 'team'").all() as Array<{ external_id: string }>).map(row => String(row.external_id))
      linkedTeams = teamIds.length
      players = await fetchPandaScorePlayersByTeams(teamIds, options)
    }
    return {
      source: search ? 'search' : 'rosters',
      linkedTeams,
      players: players.map(player => {
        const localTeamId = localTeamIdForPandaScore(player.team?.externalId)
        return { ...player, localTeamId, localPlayerId: findLocalPlayerForPandaScore(player.externalId, player.nickname, localTeamId) }
      })
    }
  } catch (cause) { throw createError(pandaScoreHttpError(cause)) }
})
