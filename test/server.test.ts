import { afterEach, describe, expect, it, vi } from 'vitest';
import { broadcaster } from '../src/server/event-broadcaster';
import { registerNextDevTools } from '../src/server/patch-fetch';
import type { DevToolsEntry } from '../src/shared/types';

const realFetch = globalThis.fetch;
const fakeFetch = vi.fn(async (_i: unknown, _init?: unknown) =>
  new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'content-type': 'application/json' } }),
);

afterEach(() => {
  vi.clearAllMocks();
});

describe('server fetch patch', () => {
  it('stays dormant (no listeners = no work) and retains nothing', async () => {
    (globalThis as { fetch: unknown }).fetch = fakeFetch;
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('next-devtools.fetch-patched')];
    registerNextDevTools();

    expect(broadcaster.hasListeners()).toBe(false);
    const res = await fetch('https://example.com/a');
    expect(res.status).toBe(201);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('broadcasts pending -> completed, bypasses devtools routes, keeps the caller response readable', async () => {
    const seen: DevToolsEntry[] = [];
    const off = broadcaster.subscribe((e) => seen.push(e));

    const res = await fetch('https://example.com/claim', { method: 'post', body: '{"a":1}', headers: { 'X-Test': '1' } });
    expect(await res.json()).toEqual({ ok: true }); // original body not locked by our clone
    await vi.waitFor(() => expect(seen.some((e) => e.category === 'network' && e.state === 'completed')).toBe(true));

    const [pending, done] = seen as any[];
    expect(pending.state).toBe('pending');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.headers['x-test']).toBe('1');
    expect(done.response.status).toBe(201);
    expect(done.response.body).toBe('{"ok":true}');

    seen.length = 0;
    await fetch('https://example.com/api/__devtools/sse');
    await fetch('https://example.com/page?_rsc=abc');
    expect(seen).toHaveLength(0);
    off();
  });

  it('is idempotent and survives Next.js re-assigning globalThis.fetch (stays outermost)', async () => {
    registerNextDevTools(); // second call is a no-op
    const seen: DevToolsEntry[] = [];
    const off = broadcaster.subscribe((e) => seen.push(e));

    const nextPatched = vi.fn((...a: Parameters<typeof fetch>) => fakeFetch(...a)) as unknown as typeof fetch;
    (nextPatched as any).__nextPatched = true;
    globalThis.fetch = nextPatched; // what Next does after instrumentation

    expect((globalThis.fetch as any).__nextPatched).toBe(true);
    await fetch('https://example.com/cached', { next: { tags: ['t'] } } as RequestInit);
    await vi.waitFor(() => expect(seen.some((e) => e.category === 'cache')).toBe(true));
    expect(nextPatched).toHaveBeenCalledTimes(1);
    off();
  });

  it('reports failures without swallowing the error', async () => {
    const seen: DevToolsEntry[] = [];
    const off = broadcaster.subscribe((e) => seen.push(e));
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('boom');
    }) as unknown as typeof fetch;

    await expect(fetch('https://example.com/x')).rejects.toThrow('boom');
    await vi.waitFor(() => expect(seen.some((e) => e.category === 'network' && e.state === 'failed')).toBe(true));
    off();
    globalThis.fetch = realFetch;
  });
});

describe('broadcaster', () => {
  it('never buffers: late subscribers see nothing from the past', () => {
    broadcaster.broadcast({ id: '1', category: 'cache', key: 'k', tags: [], status: 'HIT', timestamp: 0 });
    const seen: DevToolsEntry[] = [];
    const off = broadcaster.subscribe((e) => seen.push(e));
    expect(seen).toHaveLength(0);
    off();
  });
});

describe('getSystemInfo', () => {
  it('does not expose environment variables', async () => {
    const { getSystemInfo } = await import('../src/server/system-info');
    process.env.NEXT_PUBLIC_API_KEY = 'super-secret-key';
    process.env.SECRET_TOKEN = 'token-123';
    const info = await getSystemInfo();
    expect(info.env).toBeUndefined();
    expect(JSON.stringify(info)).not.toContain('super-secret-key');
    expect(JSON.stringify(info)).not.toContain('token-123');
    delete process.env.NEXT_PUBLIC_API_KEY;
    delete process.env.SECRET_TOKEN;
  });
});
