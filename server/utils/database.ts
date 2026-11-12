import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

declare global {
  // eslint-disable-next-line no-var
  var __dotaframeDatabase: DatabaseSync | undefined
  // eslint-disable-next-line no-var
  var __dotaframeDatabasePath: string | undefined
}

function migrationV1(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes BLOB NOT NULL,
      width INTEGER,
      height INTEGER,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      short_name TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      logo_asset_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS teams_name_unique ON teams(lower(name));

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      team_a_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      team_b_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      tournament TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      timezone TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      score_a INTEGER,
      score_b INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (team_a_id <> team_b_id),
      CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      map_number INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(match_id, map_number)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version INTEGER NOT NULL,
      match_id TEXT,
      data_json TEXT NOT NULL,
      style_json TEXT NOT NULL,
      size TEXT NOT NULL,
      thumbnail_asset_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      saved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      saved_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS revisions_project_idx ON revisions(project_id, saved_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    INSERT OR IGNORE INTO schema_migrations(version, applied_at)
    VALUES (1, datetime('now'));
  `)
}

function migrationV2(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE external_entities (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      metadata_json TEXT,
      UNIQUE(provider, entity_type, external_id),
      CHECK (provider IN ('pandascore')),
      CHECK (entity_type IN ('team', 'match', 'game', 'tournament'))
    );
    CREATE INDEX external_entities_local_idx
      ON external_entities(entity_type, local_id);

    CREATE TABLE match_games (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      map_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      winner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      begin_at TEXT,
      end_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, external_id),
      UNIQUE(match_id, map_number),
      CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled'))
    );
    CREATE INDEX match_games_match_idx ON match_games(match_id, map_number);

    ALTER TABLE matches ADD COLUMN winner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
    ALTER TABLE projects ADD COLUMN dedupe_key TEXT;
    ALTER TABLE projects ADD COLUMN source_json TEXT;
    CREATE INDEX projects_dedupe_idx ON projects(dedupe_key);

    INSERT INTO schema_migrations(version, applied_at)
    VALUES (2, datetime('now'));
  `)
}

function migrationV3(database: DatabaseSync) {
  database.exec(`
    ALTER TABLE match_games ADD COLUMN stats_provider TEXT;
    ALTER TABLE match_games ADD COLUMN stats_external_id TEXT;
    ALTER TABLE match_games ADD COLUMN stats_json TEXT;
    CREATE INDEX match_games_stats_idx ON match_games(stats_provider, stats_external_id);

    INSERT INTO schema_migrations(version, applied_at)
    VALUES (3, datetime('now'));
  `)
}

function migrationV4(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      league TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      end_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      logo_asset_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (tier IN ('', 'S', 'A', 'B', 'C', 'D'))
    );
    CREATE UNIQUE INDEX tournaments_name_unique ON tournaments(lower(name));

    INSERT INTO schema_migrations(version, applied_at)
    VALUES (4, datetime('now'));
  `)
}

function migrationV5(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      real_name TEXT NOT NULL DEFAULT '',
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      role TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      photo_asset_id TEXT REFERENCES media(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (role IN ('', '1', '2', '3', '4', '5'))
    );
    CREATE INDEX players_team_idx ON players(team_id);

    -- SQLite cannot alter a CHECK constraint: rebuild external_entities to allow 'player'.
    DROP INDEX external_entities_local_idx;
    ALTER TABLE external_entities RENAME TO external_entities_v4;
    CREATE TABLE external_entities (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      metadata_json TEXT,
      UNIQUE(provider, entity_type, external_id),
      CHECK (provider IN ('pandascore')),
      CHECK (entity_type IN ('team', 'match', 'game', 'tournament', 'player'))
    );
    INSERT INTO external_entities SELECT id, provider, entity_type, external_id, local_id, synced_at, metadata_json FROM external_entities_v4;
    DROP TABLE external_entities_v4;
    CREATE INDEX external_entities_local_idx ON external_entities(entity_type, local_id);

    INSERT INTO schema_migrations(version, applied_at)
    VALUES (5, datetime('now'));
  `)
}

function migrate(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  const applied = new Set((database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(row => row.version))
  for (const [version, migration] of [[1, migrationV1], [2, migrationV2], [3, migrationV3], [4, migrationV4], [5, migrationV5]] as const) {
    if (applied.has(version)) continue
    database.exec('BEGIN IMMEDIATE')
    try {
      migration(database)
      database.exec('COMMIT')
    } catch (cause) {
      database.exec('ROLLBACK')
      throw cause
    }
  }
}

function configuredDatabasePath() {
  return resolve(process.env.DOTAFRAME_DATABASE_PATH || '.data/dotaframe.sqlite')
}

export function useDatabase() {
  const path = configuredDatabasePath()
  if (globalThis.__dotaframeDatabase && globalThis.__dotaframeDatabasePath !== path) {
    globalThis.__dotaframeDatabase.close()
    globalThis.__dotaframeDatabase = undefined
  }
  if (!globalThis.__dotaframeDatabase) {
    mkdirSync(dirname(path), { recursive: true })
    const database = new DatabaseSync(path)
    migrate(database)
    globalThis.__dotaframeDatabase = database
    globalThis.__dotaframeDatabasePath = path
  }
  return globalThis.__dotaframeDatabase
}

export function databaseFile() {
  return configuredDatabasePath()
}

export function closeDatabase() {
  globalThis.__dotaframeDatabase?.close()
  globalThis.__dotaframeDatabase = undefined
  globalThis.__dotaframeDatabasePath = undefined
}

export function json<T>(value: string): T {
  return JSON.parse(value) as T
}
