/**
 * Editor state store with undo/redo and dirty tracking.
 *
 * State: { title, templateId, templateVersion, data, style, size, matchId }
 * - every mutation goes through `commit(next, { label, coalesce })`
 * - `coalesce` merges consecutive edits with the same key (slider drags, typing)
 * - `isDirty()` compares content against the last saved snapshot
 * - `hasUnsaved()` is the O(1) variant: states are immutable, so reference equality with the saved state
 *   is enough, and it stays correct through undo/redo
 */
import { stableStringify, clone } from '../core/utils.js';

const MAX_HISTORY = 100;
const COALESCE_MS = 900;

export function createStore(initial, { savedState = null } = {}) {
  let state = clone(initial);
  let past = [];
  let future = [];
  let lastCoalesce = null;
  let savedKey = savedState ? keyOf(savedState) : null;
  let savedRef = null;
  const initialKey = keyOf(initial);
  const listeners = new Set();

  function keyOf(s) {
    return stableStringify({ title: s.title, templateId: s.templateId, data: s.data, style: s.style, size: s.size });
  }

  function notify(meta) {
    for (const fn of listeners) fn(state, meta);
  }

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    commit(next, { label = 'Изменение', coalesce = /** @type {string | null} */ (null), source = 'user' } = {}) {
      if (next === state) return;
      const now = Date.now();
      const merge = coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < COALESCE_MS;
      if (!merge) {
        past.push({ state, label });
        if (past.length > MAX_HISTORY) past.shift();
      }
      lastCoalesce = coalesce ? { key: coalesce, at: now } : null;
      future = [];
      state = next;
      notify({ type: 'commit', label, source });
    },
    /** Replace state without history (initial load, after save). */
    reset(next, { saved = false } = {}) {
      state = next;
      past = [];
      future = [];
      lastCoalesce = null;
      if (saved) {
        savedKey = keyOf(next);
        savedRef = next;
      }
      notify({ type: 'reset' });
    },
    undo() {
      const entry = past.pop();
      if (!entry) return null;
      future.push({ state, label: entry.label });
      state = entry.state;
      lastCoalesce = null;
      notify({ type: 'undo', label: entry.label });
      return entry.label;
    },
    redo() {
      const entry = future.pop();
      if (!entry) return null;
      past.push({ state, label: entry.label });
      state = entry.state;
      lastCoalesce = null;
      notify({ type: 'redo', label: entry.label });
      return entry.label;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    markSaved(s = state) {
      savedKey = keyOf(s);
      savedRef = s;
      notify({ type: 'saved' });
    },
    /** Unsaved user changes. A brand-new untouched project is not dirty (nothing to lose). */
    isDirty: () => keyOf(state) !== (savedKey ?? initialKey),
    /** Cheap check for the UI: true until the exact saved state object is current again. */
    hasUnsaved: () => state !== savedRef,
    isNew: () => savedKey === null,
  };
}
