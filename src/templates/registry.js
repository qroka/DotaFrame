/**
 * Template registry.
 *
 * A template is a plain object created with `defineTemplate()`:
 * {
 *   id, type, version, name, description,
 *   source: 'match' | 'matches' | 'draft',   // which snapshot builder feeds it
 *   base: { width, height },                  // design frame in px (preview + export share it)
 *   exportSizes: [{ id, label, width, height }],  // must keep the base aspect ratio
 *   texts: [{ key, label, default, maxLength }],  // editable poster copy stored in data.texts
 *   settings: [...descriptors],              // see shared/settings.js
 *   defaults: {...},                          // style overrides on top of BASE_STYLE
 *   order?: number,                           // position in the template library
 *   capacity?: { min, max },                  // for multi-item templates
 *   validate(data, style) → [{ level: 'error'|'warning', message }],
 *   render(ctx) → HTMLElement                 // ctx = { template, data, style, base, url, mode }
 * }
 * Versions: register a new object with the same id and a higher `version` when a change
 * would alter saved posters; old versions stay registered so history re-renders exactly.
 */
import { BASE_STYLE } from './shared/settings.js';
import { deepMerge } from '../core/utils.js';

const registry = new Map(); // id -> Map(version -> template)

export function defineTemplate(def) {
  const required = ['id', 'type', 'version', 'name', 'source', 'base', 'render'];
  for (const key of required) if (def[key] === undefined) throw new Error(`Template is missing "${key}"`);
  const ratio = def.base.width / def.base.height;
  const exportSizes = (def.exportSizes ?? [{ width: def.base.width, height: def.base.height }]).map((s) => ({
    id: `${s.width}x${s.height}`,
    label: `${s.width} × ${s.height}`,
    ...s,
  }));
  for (const s of exportSizes) {
    if (Math.abs(s.width / s.height - ratio) > 0.001) throw new Error(`Template ${def.id}: export size ${s.id} breaks the ${def.base.width}×${def.base.height} aspect ratio`);
  }
  return {
    description: '',
    texts: [],
    settings: [],
    defaults: {},
    validate: () => [],
    ...def,
    exportSizes,
  };
}

export function registerTemplate(tpl) {
  if (!registry.has(tpl.id)) registry.set(tpl.id, new Map());
  registry.get(tpl.id).set(tpl.version, tpl);
  return tpl;
}

/** Latest version of a template, or a specific version if still registered. */
export function getTemplate(id, version) {
  const versions = registry.get(id);
  if (!versions) return null;
  if (version !== undefined && versions.has(version)) return versions.get(version);
  return versions.get(Math.max(...versions.keys()));
}

export const hasExactVersion = (id, version) => !!registry.get(id)?.has(version);

/** Latest versions of all templates, in registration order. */
export function listTemplates() {
  return [...registry.values()].map((versions) => versions.get(Math.max(...versions.keys()))).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** Full default style for a template. */
export function defaultStyle(tpl) {
  return deepMerge(BASE_STYLE, tpl.defaults ?? {});
}

/** Fill missing keys of a stored style with current defaults (forward-compatible). */
export function normalizeStyle(tpl, style) {
  return deepMerge(defaultStyle(tpl), style ?? {});
}

export function defaultTexts(tpl) {
  return Object.fromEntries((tpl.texts ?? []).map((t) => [t.key, t.default ?? '']));
}

export const TEMPLATE_TYPES = {
  announcement: 'Анонс',
  matchday: 'Игровой день',
  win: 'Победа',
  lose: 'Поражение',
  'series-result': 'Результат серии',
  draft: 'Драфт',
};
