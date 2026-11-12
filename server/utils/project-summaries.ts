import { useDatabase } from './database'

/** Project list for the gallery: no `data_json` / `style_json` / `source_json`, so the payload stays small. */
export function listProjectSummaries() {
  const rows = useDatabase().prepare(`
    SELECT id, title, template_id, template_version, match_id, size, thumbnail_asset_id, created_at, updated_at, saved_at
    FROM projects
    ORDER BY updated_at DESC
  `).all() as Array<Record<string, unknown>>
  return rows.map(row => ({
    id: row.id, title: row.title, templateId: row.template_id, templateVersion: row.template_version, matchId: row.match_id,
    size: row.size, thumbnailAssetId: row.thumbnail_asset_id, createdAt: row.created_at, updatedAt: row.updated_at, savedAt: row.saved_at
  }))
}
