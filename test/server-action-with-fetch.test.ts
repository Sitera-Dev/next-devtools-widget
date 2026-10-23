import { describe, expect, it, vi } from 'vitest';
import { broadcaster } from '../src/server/event-broadcaster';
import { registerNextDevTools } from '../src/server/patch-fetch';
import { trackServerAction } from '../src/server/track-action';
import type { ActionEntry, DevToolsEntry, NetworkEntry } from '../src/shared/types';

describe('Server Action with internal fetch() call', () => {
  it('instruments both the Server Action and the nested server-side fetch()', async () => {
    // 1. Setup server fetch patch
    registerNextDevTools();

    const seen: DevToolsEntry[] = [];
    const unsub = broadcaster.subscribe((entry) => seen.push(entry));

    // 2. Mock external endpoint for the internal fetch call
    const originalFetch = globalThis.fetch;
    const fakeApiData = { voucherId: 'v_vip_100', discount: 50, valid: true };

    globalThis.fetch = async (input, init) => {
      return new Response(JSON.stringify(fakeApiData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    // Re-register to make sure our devtools wrapper wraps the fetch
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('next-devtools.fetch-patched')];
    registerNextDevTools();

    // 3. Define Server Action that internally calls fetch
    const processVoucherOrder = trackServerAction(
      'processVoucherOrder',
      async (voucherId: string, quantity: number) => {
        // Internal fetch to external partner or microservice
        const res = await fetch(`https://partner-api.internal/vouchers/${voucherId}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer secret_partner_token',
          },
          body: JSON.stringify({ quantity }),
        });

        const data = await res.json();
        return {
          orderId: 'ord_99999',
          data,
          status: 'SUCCESS',
        };
      },
    );

    // 4. Execute the Server Action
    const result = await processVoucherOrder('v_vip_100', 2);
    expect(result.orderId).toBe('ord_99999');
    expect(result.data).toEqual(fakeApiData);

    // 5. Verify captured entries
    await vi.waitFor(() => {
      // Must have at least 1 action entry and 1 completed network entry
      const hasAction = seen.some((e) => e.category === 'action');
      const hasNetwork = seen.some((e) => e.category === 'network' && e.state === 'completed');
      expect(hasAction && hasNetwork).toBe(true);
    });

    // Verify Action entry
    const actionEntry = seen.find((e) => e.category === 'action') as ActionEntry;
    expect(actionEntry).toBeDefined();
    expect(actionEntry.actionName).toBe('processVoucherOrder');
    expect(actionEntry.args).toEqual(['v_vip_100', 2]);
    expect(actionEntry.result).toEqual({
      orderId: 'ord_99999',
      data: fakeApiData,
      status: 'SUCCESS',
    });
    expect(actionEntry.durationMs).toBeGreaterThanOrEqual(0);

    // Verify Network entry for the internal fetch
    const networkEntry = seen.find(
      (e) => e.category === 'network' && e.state === 'completed',
    ) as NetworkEntry;
    expect(networkEntry).toBeDefined();
    expect(networkEntry.origin).toBe('server'); // Must be flagged as server origin
    expect(networkEntry.request.url).toBe('https://partner-api.internal/vouchers/v_vip_100');
    expect(networkEntry.request.method).toBe('POST');
    expect(networkEntry.request.body).toBe(JSON.stringify({ quantity: 2 }));
    expect(networkEntry.response?.status).toBe(200);
    expect(networkEntry.response?.body).toBe(JSON.stringify(fakeApiData));

    unsub();
    globalThis.fetch = originalFetch;
  });

  it('captures Server Action error when internal fetch throws', async () => {
    registerNextDevTools();

    const seen: DevToolsEntry[] = [];
    const unsub = broadcaster.subscribe((entry) => seen.push(entry));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Connection reset by peer');
    };
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('next-devtools.fetch-patched')];
    registerNextDevTools();

    const failingAction = trackServerAction('failingAction', async () => {
      await fetch('https://unreachable.service/test');
    });

    await expect(failingAction()).rejects.toThrow('Connection reset by peer');

    await vi.waitFor(() => {
      expect(seen.some((e) => e.category === 'action' && e.error)).toBe(true);
      expect(seen.some((e) => e.category === 'network' && e.state === 'failed')).toBe(true);
    });

    const failedAction = seen.find((e) => e.category === 'action') as ActionEntry;
    expect(failedAction.error).toContain('Connection reset by peer');

    const failedNetwork = seen.find((e) => e.category === 'network' && e.state === 'failed') as NetworkEntry;
    expect(failedNetwork.error).toContain('Connection reset by peer');

    unsub();
    globalThis.fetch = originalFetch;
  });
});
