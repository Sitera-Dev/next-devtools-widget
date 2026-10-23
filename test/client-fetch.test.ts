import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupClientFetchProxy } from '../src/client/patch-client';
import type { ActionEntry, DevToolsEntry, NetworkEntry } from '../src/shared/types';

beforeEach(() => {
  (globalThis as any).window = globalThis;
  delete (globalThis as any)['__NEXT_DEVTOOLS_FETCH_PATCHED__'];
});

describe('Client Fetch Proxy & RSC Immunity', () => {
  it('bypasses /_next/*, /__nextjs, devtools and pure _rsc navigation URLs completely', async () => {
    const emitted: DevToolsEntry[] = [];
    const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    (window as any).fetch = mockFetch;

    setupClientFetchProxy((entry) => emitted.push(entry));

    await window.fetch('/_next/static/chunks/main.js');
    await window.fetch('/__nextjs_original-stack-frame');
    await window.fetch('/api/__devtools/sse');
    await window.fetch('/users?_rsc=1b2c3');

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(emitted).toHaveLength(0);
  });

  it('bypasses Next.js RSC router prefetch and navigation headers without next-action', async () => {
    const emitted: DevToolsEntry[] = [];
    const mockFetch = vi.fn(async () => new Response('rsc payload', { status: 200 }));
    (window as any).fetch = mockFetch;

    setupClientFetchProxy((entry) => emitted.push(entry));

    // Next.js router prefetch
    await window.fetch('/vouchers', {
      headers: { rsc: '1', 'next-router-prefetch': '1' },
    });
    // Next.js router navigation
    await window.fetch('/vouchers', {
      headers: { rsc: '1' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(emitted).toHaveLength(0);
  });

  it('handles custom Request objects without method property without crashing (toUpperCase immunity)', async () => {
    const emitted: DevToolsEntry[] = [];
    const mockFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    (window as any).fetch = mockFetch;
    setupClientFetchProxy((entry) => emitted.push(entry));

    // Simulate Next.js router prefetch object where method might be undefined or non-standard
    const fakeRequest = {
      url: 'https://example.com/api/test',
      headers: new Headers(),
    } as unknown as Request;

    const res = await window.fetch(fakeRequest);
    expect(res.status).toBe(200);

    await vi.waitFor(() => {
      expect(emitted.length).toBeGreaterThanOrEqual(1);
    });

    const netEntry = emitted.find((e) => e.category === 'network') as NetworkEntry;
    expect(netEntry).toBeDefined();
    expect(netEntry.request.method).toBe('GET'); // default fallback
  });

  it('intercepts Server Actions via next-action header EVEN when URL contains ?_rsc= (production Vercel behavior)', async () => {
    const emitted: DevToolsEntry[] = [];
    const mockFetch = vi.fn(async () => new Response('{"claimed":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    (window as any).fetch = mockFetch;
    setupClientFetchProxy((entry) => emitted.push(entry));

    // Next.js production router appends ?_rsc=... and adds rsc: 1 to Server Action POSTs
    await window.fetch('/login?_rsc=1b7c89', {
      method: 'POST',
      headers: {
        'next-action': 'abc123456789',
        'rsc': '1',
        'content-type': 'application/json',
      },
      body: JSON.stringify(['08123456789']),
    });

    await vi.waitFor(() => {
      expect(emitted.some((e) => e.category === 'action')).toBe(true);
    });

    const actionEntry = emitted.find((e) => e.category === 'action') as ActionEntry;
    expect(actionEntry).toBeDefined();
    expect(actionEntry.actionName).toContain('abc12345');
    expect(actionEntry.result).toBe('{"claimed":true}');
  });
});
