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
      const stored = await loadEntries();
      const known = new Set(buffer.map((e) => e.id));
      const restored = stored
        .filter((e) => !known.has(e.id))
        .map((e): DevToolsEntry =>
          e.category === 'network' && e.origin === 'client' && e.state === 'pending'
            ? { ...e, state: 'failed', error: 'Interrupted (page reloaded)' }
            : e,
        );
      buffer = [...restored, ...buffer].sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
      trim();
      flush();
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
