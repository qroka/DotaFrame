import { createServer } from 'node:http'

let state = 'scheduled'
const team = (id, name, acronym) => ({ id, name, acronym, image_url: null })
function currentMatch() {
  const mapFinished = state !== 'scheduled'
  const seriesFinished = state === 'finished'
  return {
    id: 1791736, name: 'Alpha vs Beta', status: seriesFinished ? 'finished' : mapFinished ? 'running' : 'not_started',
    scheduled_at: '2026-11-12T15:00:00Z', begin_at: mapFinished ? '2026-11-12T15:00:00Z' : null,
    end_at: seriesFinished ? '2026-11-12T17:00:00Z' : null, number_of_games: 3,
    opponents: [{ opponent: team(10, 'Alpha', 'ALP') }, { opponent: team(20, 'Beta', 'BET') }],
    results: [{ team_id: 10, score: seriesFinished ? 2 : mapFinished ? 1 : 0 }, { team_id: 20, score: 0 }],
    winner_id: seriesFinished ? 10 : null,
    tournament: { id: 30, name: 'Playoffs' }, league: { id: 40, name: 'Dota League' },
    games: [{ id: 501, position: 1, status: mapFinished ? 'finished' : 'not_started', winner_id: mapFinished ? 10 : null, begin_at: mapFinished ? '2026-11-12T15:00:00Z' : null, end_at: mapFinished ? '2026-11-12T16:00:00Z' : null }]
  }
}

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url?.startsWith('/__state/')) {
    state = request.url.split('/').pop() || 'scheduled'
    response.writeHead(204).end(); return
  }
  if (request.url?.startsWith('/api/proMatches')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify([{ match_id: 777, start_time: 1794495600, radiant_name: 'Alpha', dire_name: 'Beta' }]))
    return
  }
  if (request.url?.startsWith('/api/matches/777')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      match_id: 777, start_time: 1794495600, duration: 2400, radiant_name: 'Alpha', dire_name: 'Beta', radiant_win: true,
      radiant_score: 31, dire_score: 14,
      picks_bans: [
        ...[1, 2, 3, 4, 5].map((hero_id, order) => ({ is_pick: true, hero_id, team: 0, order })),
        ...[6, 7, 8, 9, 10].map((hero_id, index) => ({ is_pick: true, hero_id, team: 1, order: index + 5 })),
        { is_pick: false, hero_id: 11, team: 0, order: 10 }, { is_pick: false, hero_id: 12, team: 1, order: 11 }
      ]
    }))
    return
  }
  if (request.headers.authorization !== 'Bearer e2e-secret') { response.writeHead(401).end(); return }
  const list = request.url?.endsWith('/upcoming') && state === 'scheduled'
    || request.url?.endsWith('/running') && state === 'map'
    || request.url?.endsWith('/past') && state === 'finished' ? [currentMatch()] : []
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(list))
})
server.listen(5200, '127.0.0.1')
