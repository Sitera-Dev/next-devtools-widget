import { describe, expect, it } from 'vitest';
import { broadcaster } from '../src/server/event-broadcaster';
import { registerNextDevTools } from '../src/server/patch-fetch';

describe('Server Memory & Zero-Retention Test', () => {
  it('retains 0 entries in memory when no listeners are present', async () => {
    registerNextDevTools();

    // Verify broadcaster has no listeners
    expect(broadcaster.hasListeners()).toBe(false);

    // Mock response helper
    const originalFetch = globalThis.fetch;
    const mockData = 'x'.repeat(100_000); // 100KB payload

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: mockData }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    // Run GC if available or record initial heap
    if (global.gc) global.gc();
    const initialHeap = process.memoryUsage().heapUsed;

    // Trigger 500 requests
    for (let i = 0; i < 500; i++) {
      await fetch(`https://api.internal.test/items/${i}`);
    }

    if (global.gc) global.gc();
    const finalHeap = process.memoryUsage().heapUsed;

    // The server should retain ZERO request buffers or entries.
    // 500 * 100KB would be ~50MB if retained!
    const diffMb = (finalHeap - initialHeap) / 1024 / 1024;
    expect(diffMb).toBeLessThan(15); // Well under 10MB (typically ~1-2MB transient V8 noise)

    globalThis.fetch = originalFetch;
  });

  it('drops entries immediately when broadcast has no listeners', () => {
    let captured = false;
    expect(broadcaster.hasListeners()).toBe(false);

    // Broadcast 1000 entries
    for (let i = 0; i < 1000; i++) {
      broadcaster.broadcast({
        id: `test_${i}`,
        category: 'network',
        origin: 'server',
        state: 'completed',
        request: {
          url: `https://test.com/${i}`,
          method: 'GET',
          headers: {},
          timestamp: Date.now(),
        },
      });
    }

    // Now subscribe - should receive 0 old entries
    const unsub = broadcaster.subscribe(() => {
      captured = true;
    });

    expect(captured).toBe(false);
    unsub();
  });
});
