import type { DevToolsEntry, SystemInfo } from '../shared/types';

type Listener = (entry: DevToolsEntry) => void;

interface BroadcasterState {
  listeners: Set<Listener>;
}

// instrumentation.ts and Route Handlers can be bundled into separate module graphs,
// so the (listener-only) registry lives on globalThis. It never stores entries.
const KEY = Symbol.for('next-devtools.broadcaster');
const g = globalThis as unknown as Record<symbol, BroadcasterState | undefined>;
const state: BroadcasterState = (g[KEY] ||= { listeners: new Set() });

export const broadcaster = {
  subscribe(listener: Listener): () => void {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
  hasListeners(): boolean {
    return state.listeners.size > 0;
  },
  broadcast(entry: DevToolsEntry): void {
    // Fire and forget: if no listeners are open, discard immediately.
    // NEVER buffer entries here. Server retains 0 bytes in memory.
    for (const listener of state.listeners) {
      try {
        listener(entry);
      } catch {
        // Safe swallow to avoid crashing the server
      }
    }
  },
};

export type { SystemInfo };
