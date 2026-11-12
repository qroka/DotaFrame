import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/editor/store';

const init = { title: 'A', templateId: 't', data: { x: 1 }, style: { y: 1 }, size: '1080x1080' };

describe('editor store: hasUnsaved (cheap dirty check)', () => {
  it('is true for a project that was never saved', () => {
    expect(createStore(init).hasUnsaved()).toBe(true);
  });

  it('is false after markSaved and true after an edit', () => {
    const store = createStore(init);
    store.markSaved();
    expect(store.hasUnsaved()).toBe(false);
    store.commit({ ...store.get(), title: 'B' }, { label: 'title' });
    expect(store.hasUnsaved()).toBe(true);
  });

  it('returns to clean when undo brings back the saved state, and dirty again on redo', () => {
    const store = createStore(init);
    store.markSaved();
    store.commit({ ...store.get(), title: 'B' }, { label: 'title' });
    store.undo();
    expect(store.hasUnsaved()).toBe(false);
    store.redo();
    expect(store.hasUnsaved()).toBe(true);
  });

  it('saving an older state keeps edits made afterwards dirty', () => {
    const store = createStore(init);
    const saving = { ...store.get(), title: 'B' };
    store.commit(saving, { label: 'title' });
    store.commit({ ...saving, title: 'C' }, { label: 'title' });
    store.markSaved(saving);
    expect(store.hasUnsaved()).toBe(true);
    store.undo();
    expect(store.hasUnsaved()).toBe(false);
  });

  it('reset({ saved: true }) marks the new state clean and clears history', () => {
    const store = createStore(init);
    store.commit({ ...store.get(), title: 'B' }, { label: 'title' });
    store.reset({ ...init, title: 'Server' }, { saved: true });
    expect(store.hasUnsaved()).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('coalesces rapid edits with the same key into one undo step', () => {
    const store = createStore(init);
    store.markSaved();
    for (const title of ['B', 'Bo', 'Bob']) store.commit({ ...store.get(), title }, { label: 'title', coalesce: 'title' });
    expect(store.get().title).toBe('Bob');
    store.undo();
    expect(store.get().title).toBe('A');
    expect(store.canUndo()).toBe(false);
    expect(store.hasUnsaved()).toBe(false);
  });
});
