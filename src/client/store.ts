import { useSyncExternalStore } from 'react';
import { entryTimestamp, type DevToolsEntry, type SystemInfo } from '../shared/types';
import { clearEntries, deleteEntries, loadEntries, saveEntry } from './storage';

export type SseStatus = 'idle' | 'connecting' | 'open' | 'closed';

export interface DevToolsState {
  entries: DevToolsEntry[];
  system: SystemInfo | null;
  sse: SseStatus;
}

function createStore() {
  let buffer: DevToolsEntry[] = [];
  let state: DevToolsState = { entries: [], system: null, sse: 'idle' };
  let maxEntries = 200;
  let recording = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  let isHydrated = false;
  let hydratePromise: Promise<void> | null = null;

  const flush = () => {
    timer = null;
    state = { ...state, entries: buffer.slice() };
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 32);
  };

  const trim = () => {
    if (buffer.length <= maxEntries) return;
    const dropped = buffer.splice(0, buffer.length - maxEntries);
    void deleteEntries(dropped.map((e) => e.id));
  };

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    configure(opts: { maxEntries?: number }) {
      if (opts.maxEntries) maxEntries = opts.maxEntries;
      trim();
    },
    setRecording(on: boolean) {
      recording = on;
    },
    upsert(entry: DevToolsEntry) {
      if (!recording) return;
      let i = buffer.length - 1; // updates target recent entries, scan from the end
      while (i >= 0 && buffer[i].id !== entry.id) i--;
      if (i >= 0) buffer[i] = entry;
      else buffer.push(entry);
      trim();
      void saveEntry(entry);
      schedule();
    },
    clear() {
      buffer = [];
      isHydrated = false;
      void clearEntries();
      flush();
    },
    setSystem(system: SystemInfo) {
      state = { ...state, system };
      schedule();
    },
    setSse(sse: SseStatus) {
      state = { ...state, sse };
      schedule();
    },
    /** Restore entries persisted by a previous page load (IndexedDB / sessionStorage). */
    async hydrate() {
      if (isHydrated) return;
      if (hydratePromise) return hydratePromise;

      hydratePromise = (async () => {
        try {
          const stored = await loadEntries();
          const byId = new Map<string, DevToolsEntry>();
          for (const item of stored) {
            const e =
              item.category === 'network' && item.origin === 'client' && item.state === 'pending'
                ? { ...item, state: 'failed', error: 'Interrupted (page reloaded)' }
                : item;
            byId.set(e.id, e);
          }
          // Current in-memory buffer wins over older stored entries
          for (const item of buffer) {
            byId.set(item.id, item);
          }
          buffer = Array.from(byId.values()).sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
          trim();
          flush();
          isHydrated = true;
        } finally {
          hydratePromise = null;
        }
      })();

      return hydratePromise;
    },
  };
}

export type DevToolsStore = ReturnType<typeof createStore>;

// Survives HMR re-evaluation of this module; the fetch patch is installed once per window.
const KEY = Symbol.for('next-devtools.store');
const g = globalThis as unknown as Record<symbol, DevToolsStore | undefined>;
export const store: DevToolsStore = (g[KEY] ||= createStore());

export function useDevToolsState(): DevToolsState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
