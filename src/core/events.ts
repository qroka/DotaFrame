/** Tiny pub/sub used for cross-module notifications (data changed, toasts…). */
type Listener = (payload?: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

export function on(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => { listeners.get(event)?.delete(fn); };
}

export function emit(event: string, payload?: unknown): void {
  for (const fn of listeners.get(event) ?? []) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[events] listener for "${event}" failed`, err);
    }
  }
}
