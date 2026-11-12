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
import { stableStringify, clone, type AnyRecord } from '../core/utils';

const MAX_HISTORY = 100;
const COALESCE_MS = 900;

/** The part of a publication the editor edits; extra fields (id, matchId, ...) are carried along untouched. */
export interface EditorState {
  title: string;
  templateId: string;
  data: AnyRecord;
  style: AnyRecord;
  size: string;
}

export interface CommitMeta { label?: string; coalesce?: string | null; source?: string }
export type StoreEvent = { type: 'commit' | 'undo' | 'redo'; label: string; source?: string } | { type: 'reset' | 'saved' };
type HistoryEntry<S> = { state: S; label: string };

export function createStore<S extends EditorState>(initial: S, { savedState = null }: { savedState?: S | null } = {}) {
  let state: S = clone(initial);
  let past: Array<HistoryEntry<S>> = [];
  let future: Array<HistoryEntry<S>> = [];
  let lastCoalesce: { key: string; at: number } | null = null;
  let savedKey: string | null = savedState ? keyOf(savedState) : null;
  let savedRef: S | null = null;
  const initialKey = keyOf(initial);
  const listeners = new Set<(state: S, meta: StoreEvent) => void>();

  function keyOf(s: EditorState): string {
    return stableStringify({ title: s.title, templateId: s.templateId, data: s.data, style: s.style, size: s.size });
  }

  function notify(meta: StoreEvent): void {
    for (const fn of listeners) fn(state, meta);
  }

  return {
    get: () => state,
    subscribe(fn: (state: S, meta: StoreEvent) => void): () => void {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    commit(next: S, { label = 'Изменение', coalesce = null, source = 'user' }: CommitMeta = {}): void {
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
    reset(next: S, { saved = false }: { saved?: boolean } = {}): void {
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
    undo(): string | null {
      const entry = past.pop();
      if (!entry) return null;
      future.push({ state, label: entry.label });
      state = entry.state;
      lastCoalesce = null;
      notify({ type: 'undo', label: entry.label });
      return entry.label;
    },
    redo(): string | null {
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
    markSaved(s: S = state): void {
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
