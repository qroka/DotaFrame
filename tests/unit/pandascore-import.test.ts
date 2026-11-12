import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, useDatabase } from '../../server/utils/database'
import { createPackageProjects, findLocalTeamForPandaScore, getPublicationPackage, importPandaScoreMatch, importPandaScoreTeams } from '../../server/utils/pandascore-import'
import { normalizePandaScoreMatch } from '../../server/utils/providers/pandascore'
import { repository } from '../../server/utils/repository'

let directory = ''
const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const logoFetch = vi.fn(async () => new Response(logo, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(logo.length) } })) as any
const raw = (patch: Record<string, unknown> = {}) => ({
  id: 901, name: 'Alpha vs Beta', status: 'not_started', scheduled_at: '2026-11-12T15:00:00Z', begin_at: null, end_at: null, number_of_games: 3,
  opponents: [
    { opponent: { id: 10, name: 'Alpha', acronym: 'ALP', image_url: 'https://cdn.pandascore.co/alpha.png' } },
    { opponent: { id: 20, name: 'Beta', acronym: 'BET', image_url: 'https://cdn.pandascore.co/beta.png' } }
  ], results: [{ team_id: 10, score: 0 }, { team_id: 20, score: 0 }], winner_id: null,
  tournament: { id: 30, name: 'Playoffs' }, league: { id: 40, name: 'Dota League' },
  games: [{ id: 501, position: 1, status: 'not_started', winner_id: null, begin_at: null, end_at: null }], ...patch
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dotaframe-pandascore-'))
  process.env.DOTAFRAME_DATABASE_PATH = join(directory, 'test.sqlite')
  logoFetch.mockClear()
})
afterEach(() => { closeDatabase(); rmSync(directory, { recursive: true, force: true }); delete process.env.DOTAFRAME_DATABASE_PATH })

describe('PandaScore SQLite import', () => {
  it('upgrades an existing v1 database without replacing it', () => {
    const legacy = new DatabaseSync(process.env.DOTAFRAME_DATABASE_PATH!)
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(1, datetime('now'));
      CREATE TABLE teams(id TEXT PRIMARY KEY);
      CREATE TABLE matches(id TEXT PRIMARY KEY);
      CREATE TABLE projects(id TEXT PRIMARY KEY);
    `)
    legacy.close()
    const database = useDatabase()
    expect((database.prepare('SELECT max(version) version FROM schema_migrations').get() as any).version).toBe(5)
    expect((database.prepare("SELECT count(*) count FROM pragma_table_info('projects') WHERE name = 'dedupe_key'").get() as any).count).toBe(1)
    expect((database.prepare("SELECT count(*) count FROM sqlite_master WHERE type = 'table' AND name = 'match_games'").get() as any).count).toBe(1)
    expect((database.prepare("SELECT count(*) count FROM pragma_table_info('match_games') WHERE name = 'stats_json'").get() as any).count).toBe(1)
  })

  it('runs migrations and imports teams, logos, match and games once', async () => {
    const match = normalizePandaScoreMatch(raw())
    const first = await importPandaScoreMatch(match, { fetchImpl: logoFetch })
    const second = await importPandaScoreMatch(match, { fetchImpl: logoFetch })
    const database = useDatabase()
    expect(second.matchId).toBe(first.matchId)
    expect((database.prepare('SELECT count(*) count FROM teams').get() as any).count).toBe(2)
    expect((database.prepare('SELECT count(*) count FROM matches').get() as any).count).toBe(1)
    expect((database.prepare('SELECT count(*) count FROM match_games').get() as any).count).toBe(1)
    expect((database.prepare('SELECT count(*) count FROM media').get() as any).count).toBe(2)
    expect((database.prepare('SELECT max(version) version FROM schema_migrations').get() as any).version).toBe(5)
    expect((database.prepare('SELECT length(bytes) bytes FROM media LIMIT 1').get() as any).bytes).toBe(logo.length)
  })

  it('deduplicates package projects and preserves their snapshot after sync', async () => {
    const imported = await importPandaScoreMatch(normalizePandaScoreMatch(raw()), { fetchImpl: logoFetch })
    const created = createPackageProjects(imported.matchId)
    expect(created.created).toHaveLength(1)
    expect(createPackageProjects(imported.matchId).created).toHaveLength(0)
    const project = created.created[0] as any
    expect(project.data.status).toBe('scheduled')
    await importPandaScoreMatch(normalizePandaScoreMatch(raw({
      status: 'finished', winner_id: 10, results: [{ team_id: 10, score: 2 }, { team_id: 20, score: 0 }],
      games: [{ id: 501, position: 1, status: 'finished', winner_id: 10, begin_at: null, end_at: '2026-11-12T16:00:00Z' }]
    })), { fetchImpl: logoFetch, enrichOpenDota: false })
    expect((repository.projects.get(project.id) as any).data.status).toBe('scheduled')
    const pkg = getPublicationPackage(imported.matchId, String((repository.matches.get(imported.matchId) as any).teamAId))
    expect(pkg.items.find(item => item.kind === 'map-result')?.status).toBe('ready')
    expect(pkg.items.find(item => item.kind === 'series-result')?.status).toBe('ready')
  })

  it('ignores canceled winners in persisted match and game', async () => {
    const imported = await importPandaScoreMatch(normalizePandaScoreMatch(raw({
      status: 'canceled', winner_id: 10,
      games: [{ id: 501, position: 1, status: 'canceled', winner_id: 10, begin_at: null, end_at: null }]
    })), { fetchImpl: logoFetch })
    expect((repository.matches.get(imported.matchId) as any).winnerTeamId).toBeNull()
    expect(getPublicationPackage(imported.matchId).games[0]?.winnerTeamId).toBeNull()
  })

  it('stores reliable OpenDota picks, bans and stats without overwriting a draft', async () => {
    const openDotaFetch = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/proMatches')) return new Response(JSON.stringify([{ match_id: 777, start_time: 1794495600, radiant_name: 'Alpha', dire_name: 'Beta' }]))
      return new Response(JSON.stringify({
        match_id: 777, start_time: 1794495600, duration: 2400, radiant_name: 'Alpha', dire_name: 'Beta', radiant_win: true,
        radiant_score: 31, dire_score: 14,
        picks_bans: [
          ...[1, 2, 3, 4, 5].map((hero_id, order) => ({ is_pick: true, hero_id, team: 0, order })),
          ...[6, 7, 8, 9, 10].map((hero_id, index) => ({ is_pick: true, hero_id, team: 1, order: index + 5 })),
          { is_pick: false, hero_id: 11, team: 0, order: 10 }, { is_pick: false, hero_id: 12, team: 1, order: 11 }
        ], players: [{ hero_id: 1, player_slot: 0, kills: 10, deaths: 1, assists: 12, net_worth: 25000 }]
      }))
    }) as any
    const match = normalizePandaScoreMatch(raw({
      status: 'finished', begin_at: '2026-11-12T15:00:00Z', winner_id: 10,
      games: [{ id: 501, position: 1, status: 'finished', winner_id: 10, begin_at: '2026-11-12T15:00:00Z', end_at: '2026-11-12T15:40:00Z' }]
    }))
    const imported = await importPandaScoreMatch(match, { fetchImpl: logoFetch, openDotaFetchImpl: openDotaFetch })
    const draft = repository.drafts.find(imported.matchId, 1) as any
    expect(draft.picksRadiant).toEqual([1, 2, 3, 4, 5])
    expect(draft.bansDire).toEqual([12])
    expect(draft.source).toMatchObject({ provider: 'opendota', externalId: '777' })
    const game = getPublicationPackage(imported.matchId).games[0]!
    expect(game.statsExternalId).toBe('777')
    expect(game.stats).toMatchObject({ radiantScore: 31, direScore: 14 })
    expect(getPublicationPackage(imported.matchId).items.find(item => item.kind === 'draft')?.status).toBe('ready')

    repository.drafts.save({ ...draft, picksRadiant: [101, 102, 103, 104, 105], source: { provider: 'manual' } })
    await importPandaScoreMatch(match, { fetchImpl: logoFetch, openDotaFetchImpl: openDotaFetch })
    expect((repository.drafts.find(imported.matchId, 1) as any).picksRadiant).toEqual([101, 102, 103, 104, 105])
  })
})

describe('PandaScore team import', () => {
  const alpha = { externalId: '10', name: 'Alpha', shortName: 'ALP', logoUrl: 'https://cdn.pandascore.co/alpha.png', location: 'NL' }
  const beta = { externalId: '20', name: 'Beta', shortName: null, logoUrl: null, location: null }

  it('creates teams with logo and region once, then updates them in place', async () => {
    const first = await importPandaScoreTeams([alpha, beta], { fetchImpl: logoFetch })
    expect(first).toMatchObject({ created: 2, updated: 0 })
    const second = await importPandaScoreTeams([alpha], { fetchImpl: logoFetch })
    expect(second).toMatchObject({ created: 0, updated: 1 })
    expect(second.imported[0]!.localId).toBe(first.imported[0]!.localId)
    const database = useDatabase()
    expect((database.prepare('SELECT count(*) count FROM teams').get() as any).count).toBe(2)
    expect((database.prepare('SELECT count(*) count FROM media').get() as any).count).toBe(1)
    const team = repository.teams.get(first.imported[0]!.localId) as any
    expect(team).toMatchObject({ name: 'Alpha', shortName: 'ALP', region: 'NL' })
    expect(team.logoAssetId).toBeTruthy()
    expect(team.externalRefs).toEqual([{ provider: 'pandascore', externalId: '10' }])
  })

  it('links an existing manual team with the same name instead of duplicating it', async () => {
    const manual = repository.teams.save({ name: 'alpha', shortName: '', region: 'Европа', notes: 'своя', logoAssetId: null }) as any
    const result = await importPandaScoreTeams([alpha], { fetchImpl: logoFetch })
    expect(result).toMatchObject({ created: 0, updated: 1 })
    expect(result.imported[0]!.localId).toBe(manual.id)
    expect(findLocalTeamForPandaScore('10', 'Alpha')).toBe(manual.id)
    const team = repository.teams.get(manual.id) as any
    expect(team).toMatchObject({ name: 'Alpha', region: 'Европа', notes: 'своя' })
  })

  it('reuses imported teams when a match with them is imported later', async () => {
    const teams = await importPandaScoreTeams([alpha, beta], { fetchImpl: logoFetch })
    const imported = await importPandaScoreMatch(normalizePandaScoreMatch(raw()), { fetchImpl: logoFetch })
    const match = repository.matches.get(imported.matchId) as any
    expect([match.teamAId, match.teamBId]).toEqual(teams.imported.map(item => item.localId))
    expect((useDatabase().prepare('SELECT count(*) count FROM teams').get() as any).count).toBe(2)
  })
})
