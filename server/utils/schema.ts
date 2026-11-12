/**
 * Single description of the tables that make up a backup.
 * Order matters on restore: parents come before the rows that reference them.
 * tests/unit/backup-schema.test.ts checks this list against the live SQLite schema,
 * so adding a column in a migration without listing it here fails the build.
 */
export interface BackupTable {
  primaryKey: string
  columns: readonly string[]
}

export const BACKUP_TABLES = {
  media: {
    primaryKey: 'id',
    columns: ['id', 'kind', 'mime_type', 'bytes', 'width', 'height', 'name', 'created_at']
  },
  teams: {
    primaryKey: 'id',
    columns: ['id', 'name', 'short_name', 'region', 'notes', 'logo_asset_id', 'created_at', 'updated_at']
  },
  tournaments: {
    primaryKey: 'id',
    columns: ['id', 'name', 'league', 'tier', 'start_date', 'end_date', 'notes', 'logo_asset_id', 'created_at', 'updated_at']
  },
  players: {
    primaryKey: 'id',
    columns: ['id', 'nickname', 'real_name', 'team_id', 'role', 'country', 'notes', 'photo_asset_id', 'created_at', 'updated_at']
  },
  matches: {
    primaryKey: 'id',
    columns: [
      'id', 'team_a_id', 'team_b_id', 'tournament', 'stage', 'start_date', 'start_time', 'timezone',
      'format', 'status', 'score_a', 'score_b', 'notes', 'created_at', 'updated_at', 'winner_team_id'
    ]
  },
  drafts: {
    primaryKey: 'id',
    columns: ['id', 'match_id', 'map_number', 'data_json', 'updated_at']
  },
  projects: {
    primaryKey: 'id',
    columns: [
      'id', 'title', 'template_id', 'template_version', 'match_id', 'data_json', 'style_json', 'size',
      'thumbnail_asset_id', 'created_at', 'updated_at', 'saved_at', 'dedupe_key', 'source_json'
    ]
  },
  revisions: {
    primaryKey: 'id',
    columns: ['id', 'project_id', 'saved_at', 'note', 'snapshot_json']
  },
  settings: {
    primaryKey: 'key',
    columns: ['key', 'value_json']
  },
  external_entities: {
    primaryKey: 'id',
    columns: ['id', 'provider', 'entity_type', 'external_id', 'local_id', 'synced_at', 'metadata_json']
  },
  match_games: {
    primaryKey: 'id',
    columns: [
      'id', 'match_id', 'provider', 'external_id', 'map_number', 'status', 'winner_team_id', 'begin_at',
      'end_at', 'created_at', 'updated_at', 'stats_provider', 'stats_external_id', 'stats_json'
    ]
  }
} as const satisfies Record<string, BackupTable>

export type BackupTableName = keyof typeof BACKUP_TABLES
