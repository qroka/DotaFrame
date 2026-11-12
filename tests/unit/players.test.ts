import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { findLocalPlayerForPandaScore, importPandaScorePlayers, importPandaScoreTeams } from '../../server/utils/pandascore-import'
import { fetchPandaScorePlayersByTeams, normalizePandaScorePlayer, pandaScorePlayersImportSchema } from '../../server/utils/providers/pandascore'
import { repository } from '../../server/utils/repository'
import { countryLabel, playerRoleLabel } from '../../app/utils/players'

let directory = ''
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const imageFetch = vi.fn(async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(png.length) } })) as any
const code = (fn: () => unknown) => { try { fn() } catch (error) { return (error as { statusCode?: number }).statusCode } }
const count = (sql: string) => (useDatabase().prepare(sql).get() as { count: number }).count

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-players-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
  imageFetch.mockClear()
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

const spirit = { externalId: '1669', name: 'Team Spirit', shortName: 'TS', logoUrl: null, location: 'RU' }
const liquid = { externalId: '1647', name: 'Team Liquid', shortName: 'Liquid', logoUrl: null, location: 'NL' }
const yatoro = { externalId: '30258', nickname: 'Yatoro', realName: 'Ilya Mulyarchuk', role: '1' as const, country: 'UA', photoUrl: 'https://cdn-api.pandascore.co/y.png', team: { externalId: '1669', name: 'Team Spirit' } }

describe('players migration', () => {
  it('upgrades a v4 database and keeps existing external links while allowing player links', () => {
    const legacy = new DatabaseSync(process.env.DOTAFRAME_DATABASE_PATH!)
    legacy.exec(`
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(1, 'x'), (2, 'x'), (3, 'x'), (4, 'x');
      CREATE TABLE media(id TEXT PRIMARY KEY); CREATE TABLE teams(id TEXT PRIMARY KEY); CREATE TABLE match_games(id TEXT PRIMARY KEY);
      CREATE TABLE external_entities (id TEXT PRIMARY KEY, provider TEXT NOT NULL, entity_type TEXT NOT NULL, external_id TEXT NOT NULL,
        local_id TEXT NOT NULL, synced_at TEXT NOT NULL, metadata_json TEXT, UNIQUE(provider, entity_type, external_id),
        CHECK (provider IN ('pandascore')), CHECK (entity_type IN ('team', 'match', 'game', 'tournament')));
      CREATE INDEX external_entities_local_idx ON external_entities(entity_type, local_id);
      INSERT INTO external_entities VALUES('e1', 'pandascore', 'team', '1669', 'team_1', 'now', '{"logoUrl":null}');
    `)
    legacy.close()
    const database = useDatabase()
    expect(count('SELECT max(version) count FROM schema_migrations')).toBe(5)
    expect(database.prepare('SELECT local_id, metadata_json FROM external_entities WHERE id = ?').get('e1')).toEqual({ local_id: 'team_1', metadata_json: '{"logoUrl":null}' })
    database.prepare("INSERT INTO external_entities VALUES('e2', 'pandascore', 'player', '30258', 'player_1', 'now', NULL)").run()
    expect(count("SELECT count(*) count FROM sqlite_master WHERE type = 'index' AND name = 'external_entities_local_idx'")).toBe(1)
  })
})

describe('player repository', () => {
  it('saves players with an optional team and validates role and team', () => {
    const team = repository.teams.save({ name: 'Spirit' })!
    const player = repository.players.save({ nickname: 'Collapse', teamId: team.id, role: '3', country: 'RU' })!
    expect(player).toMatchObject({ nickname: 'Collapse', realName: '', teamId: team.id, role: '3', externalRefs: [] })
    expect(repository.players.save({ nickname: 'Free agent', teamId: '' })!.teamId).toBeNull()
    expect(code(() => repository.players.save({ nickname: 'X', role: '6' }))).toBe(422)
    expect(code(() => repository.players.save({ nickname: 'X', teamId: 'team_missing' }))).toBe(422)
    expect(code(() => repository.players.save({ nickname: ' ' }))).toBe(422)
  })

  it('keeps the player but clears the team when the team is deleted, and removes player links on delete', () => {
    const team = repository.teams.save({ name: 'Spirit' })!
    const player = repository.players.save({ nickname: 'Mira', teamId: team.id })!
    repository.teams.remove(String(team.id))
    expect(repository.players.get(String(player.id))!.teamId).toBeNull()
    useDatabase().prepare("INSERT INTO external_entities(id,provider,entity_type,external_id,local_id,synced_at) VALUES('e1','pandascore','player','1',?,'now')").run(String(player.id))
    repository.players.remove(String(player.id))
    expect(count("SELECT count(*) count FROM external_entities WHERE entity_type = 'player'")).toBe(0)
  })
})

describe('PandaScore players', () => {
  it('normalizes nickname, real name, role, country, photo and current team', () => {
    expect(normalizePandaScorePlayer({ id: 30258, name: 'Yatoro', first_name: 'Ilya', last_name: 'Mulyarchuk', role: '1', nationality: 'UA', image_url: 'https://cdn-api.pandascore.co/y.png', current_team: { id: 1669, name: 'Team Spirit' } }))
      .toEqual(yatoro)
    expect(normalizePandaScorePlayer({ id: 1, name: 'anon', role: 'coach', current_team: null }))
      .toEqual({ externalId: '1', nickname: 'anon', realName: '', role: '', country: '', photoUrl: null, team: null })
  })

  it('pages through team rosters until a short page', async () => {
    const page = (size: number, offset: number) => Array.from({ length: size }, (_, index) => ({ id: offset + index, name: `p${offset + index}` }))
    const fetchImpl = vi.fn(async (url: unknown) => new Response(JSON.stringify(/[?&]page=1(&|$)/.test(String(url)) ? page(100, 0) : page(3, 100)), { status: 200 })) as any
    const players = await fetchPandaScorePlayersByTeams(['1669', '1647'], { token: 't', fetchImpl })
    expect(players).toHaveLength(103)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('filter%5Bteam_id%5D=1669%2C1647')
    expect(await fetchPandaScorePlayersByTeams([], { token: 't', fetchImpl })).toEqual([])
  })

  it('validates the import request size', () => {
    expect(pandaScorePlayersImportSchema.safeParse({ externalIds: ['30258'] }).success).toBe(true)
    expect(pandaScorePlayersImportSchema.safeParse({ externalIds: Array.from({ length: 101 }, (_, i) => String(i)) }).success).toBe(false)
  })
})

describe('PandaScore player import', () => {
  it('links players to directory teams, downloads the photo once and follows transfers on re-import', async () => {
    const teams = await importPandaScoreTeams([spirit, liquid], { fetchImpl: imageFetch })
    const [spiritId, liquidId] = teams.imported.map(item => item.localId)
    const first = await importPandaScorePlayers([yatoro], { fetchImpl: imageFetch })
    expect(first).toMatchObject({ created: 1, updated: 0, withoutTeam: 0 })
    const localId = first.imported[0]!.localId
    expect(repository.players.get(localId)).toMatchObject({ nickname: 'Yatoro', realName: 'Ilya Mulyarchuk', teamId: spiritId, role: '1', country: 'UA' })
    repository.players.save({ ...repository.players.get(localId), notes: 'MVP' })

    const transferred = await importPandaScorePlayers([{ ...yatoro, team: { externalId: '1647', name: 'Team Liquid' } }], { fetchImpl: imageFetch })
    expect(transferred).toMatchObject({ created: 0, updated: 1 })
    expect(repository.players.get(localId)).toMatchObject({ teamId: liquidId, notes: 'MVP', externalRefs: [{ provider: 'pandascore', externalId: '30258' }] })
    expect(imageFetch).toHaveBeenCalledTimes(1)

    const released = await importPandaScorePlayers([{ ...yatoro, team: { externalId: '999', name: 'Unknown' } }], { fetchImpl: imageFetch })
    expect(released).toMatchObject({ withoutTeam: 1 })
    expect(repository.players.get(localId)!.teamId).toBeNull()
  })

  it('links a manual player with the same nickname only when the team matches or is empty', async () => {
    const teams = await importPandaScoreTeams([spirit, liquid], { fetchImpl: imageFetch })
    const [spiritId, liquidId] = teams.imported.map(item => item.localId)
    const namesake = repository.players.save({ nickname: 'yatoro', teamId: liquidId })!
    const manual = repository.players.save({ nickname: 'YATORO', teamId: spiritId, notes: 'своя запись' })!
    expect(findLocalPlayerForPandaScore('30258', 'Yatoro', spiritId)).toBe(manual.id)
    const result = await importPandaScorePlayers([yatoro], { fetchImpl: imageFetch })
    expect(result.imported[0]!.localId).toBe(manual.id)
    expect(repository.players.get(String(namesake.id))!.externalRefs).toEqual([])
    expect(repository.players.list()).toHaveLength(2)
  })
})

describe('player labels', () => {
  it('formats positions and country codes', () => {
    expect(playerRoleLabel('1')).toBe('Pos 1 · Керри')
    expect(playerRoleLabel('')).toBe('—')
    expect(countryLabel('UA')).toBe('Украина')
    expect(countryLabel('Европа')).toBe('Европа')
  })
})
