import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DevToolsEntry, NetworkEntry } from '../src/shared/types';
import * as storage from '../src/client/storage';
import { store } from '../src/client/store';

describe('Store & UI deduplication', () => {
  beforeEach(() => {
    store.clear();
  });

  it('deduplicates concurrent hydrate() calls without creating duplicate entries', async () => {
    const mockEntries: NetworkEntry[] = [
      {
        id: 'net_1',
        category: 'network',
        origin: 'client',
        state: 'completed',
        request: { url: '/api/vouchers', method: 'GET', headers: {}, timestamp: 1000 },
        response: { status: 200, statusText: 'OK', headers: {}, durationMs: 50 },
      },
      {
        id: 'net_2',
        category: 'network',
        origin: 'server',
        state: 'completed',
        request: { url: '/api/claim', method: 'POST', headers: {}, timestamp: 1100 },
        response: { status: 200, statusText: 'OK', headers: {}, durationMs: 80 },
      },
    ];

    // Simulate async storage load with a delay
    vi.spyOn(storage, 'loadEntries').mockImplementation(
      async () => new Promise((resolve) => setTimeout(() => resolve([...mockEntries]), 15)),
    );

    // Concurrent hydration (simulate React StrictMode double effect)
    await Promise.all([store.hydrate(), store.hydrate()]);

    const state = store.getState();
    const ids = state.entries.map((e) => e.id);
    expect(ids).toEqual(['net_1', 'net_2']);
    expect(state.entries).toHaveLength(2);
  });

  it('deduplicates stored entries if storage returned duplicates', async () => {
    const mockDuplicateEntries: NetworkEntry[] = [
      {
        id: 'net_dup_1',
        category: 'network',
        origin: 'client',
        state: 'completed',
        request: { url: '/api/test', method: 'GET', headers: {}, timestamp: 1000 },
        response: { status: 200, statusText: 'OK', headers: {}, durationMs: 20 },
      },
      {
        id: 'net_dup_1',
        category: 'network',
        origin: 'client',
        state: 'completed',
        request: { url: '/api/test', method: 'GET', headers: {}, timestamp: 1000 },
        response: { status: 200, statusText: 'OK', headers: {}, durationMs: 20 },
      },
    ];

    vi.spyOn(storage, 'loadEntries').mockResolvedValue(mockDuplicateEntries);

    await store.hydrate();

    const state = store.getState();
    const dups = state.entries.filter((e) => e.id === 'net_dup_1');
    expect(dups).toHaveLength(1);
  });

  it('upsert updates existing entry in-place instead of appending duplicate', async () => {
    const initial: NetworkEntry = {
      id: 'net_upsert_1',
      category: 'network',
      origin: 'client',
      state: 'pending',
      request: { url: '/api/upsert', method: 'POST', headers: {}, timestamp: 2000 },
    };

    store.upsert(initial);
    await vi.waitFor(() => {
      expect(store.getState().entries.filter((e) => e.id === 'net_upsert_1')).toHaveLength(1);
    });

    const completed: NetworkEntry = {
      ...initial,
      state: 'completed',
      response: { status: 200, statusText: 'OK', headers: {}, durationMs: 120 },
    };

    store.upsert(completed);
    await vi.waitFor(() => {
      const matching = store.getState().entries.filter((e) => e.id === 'net_upsert_1');
      expect(matching).toHaveLength(1);
      expect((matching[0] as NetworkEntry).state).toBe('completed');
    });
  });
});
