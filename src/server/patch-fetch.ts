import { AsyncLocalStorage } from 'node:async_hooks';
import { broadcaster } from './event-broadcaster';
import type { CacheEntry, NetworkEntry } from '../shared/types';
import {
  captureResponseBody,
  cloneRequestForBody,
  describeBody,
  genId,
  getMethod,
  getRequestHeaders,
  getUrl,
  headersToObject,
  isInternalRequest,
  safeClone,
} from '../shared/utils';

type FetchFn = typeof fetch;

const PATCHED = Symbol.for('next-devtools.fetch-patched');
const DEVTOOLS_FETCH = Symbol.for('next-devtools.fetch-wrapped');
const fetchContext = new AsyncLocalStorage<boolean>();

function isCacheable(init: RequestInit | undefined): { tags: string[]; revalidate?: number | false } | null {
  const next = (init as { next?: { tags?: string[]; revalidate?: number | false } } | undefined)?.next;
  if (next?.tags || next?.revalidate !== undefined || init?.cache === 'force-cache' || init?.cache === 'only-if-cached') {
    return { tags: next?.tags ?? [], revalidate: next?.revalidate };
  }
  return null;
}

function wrapFetch(original: FetchFn): FetchFn {
  const wrapped = function devtoolsFetch(this: unknown, ...args: Parameters<FetchFn>): Promise<Response> {
    // If we are already executing inside a devtoolsFetch call on this async stack, pass through directly
    if (fetchContext.getStore()) {
      return original.apply(this, args);
    }

    const [input, init] = args;
    // Nobody is watching: zero overhead, zero allocation.
    if (!broadcaster.hasListeners()) return original.apply(this, args);

    const url = getUrl(input);
    const headers = getRequestHeaders(input, init);
    if (isInternalRequest(url, headers)) return original.apply(this, args);

    const method = getMethod(input, init);
    const startTime = Date.now();
    const t0 = performance.now();
    const id = genId('srv');
    const reqClone = cloneRequestForBody(input, init, method);

    const entry: NetworkEntry = {
      id,
      category: 'network',
      origin: 'server',
      state: 'pending',
      request: {
        url,
        method,
        headers,
        ...describeBody(init?.body),
        timestamp: startTime,
      },
    };
    broadcaster.broadcast(entry);

    const promise = fetchContext.run(true, () => original.apply(this, args));

    // Observe in the background so the caller's promise is returned untouched.
    promise.then(
      async (response) => {
        const ttfbMs = performance.now() - t0;
        const clone = safeClone(response);
        const tBody = performance.now();
        const [captured, reqBody] = await Promise.all([
          clone ? captureResponseBody(clone) : Promise.resolve(null),
          reqClone ? reqClone.text().catch(() => null) : Promise.resolve(null),
        ]);
        const now = performance.now();
        const request = reqBody != null ? { ...entry.request, body: reqBody } : entry.request;

        broadcaster.broadcast({
          ...entry,
          request,
          state: 'completed',
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: headersToObject(response.headers),
            body: captured?.body ?? null,
            bodyEncoding: captured?.encoding,
            bodyTruncated: captured?.truncated,
            contentType: captured?.contentType,
            size: captured?.size,
            durationMs: now - t0,
            ttfbMs,
            downloadMs: now - tBody,
          },
        });

        const cache = isCacheable(init);
        if (cache) {
          const header = response.headers.get('x-nextjs-cache');
          // Heuristic: Next's data cache answers without touching the network.
          const status: CacheEntry['status'] =
            header === 'HIT' || header === 'MISS' || header === 'STALE'
              ? header
              : ttfbMs < 2
                ? 'HIT'
                : 'MISS';
          broadcaster.broadcast({
            id: genId('cch'),
            category: 'cache',
            key: `${method} ${url}`,
            url,
            tags: cache.tags,
            revalidate: cache.revalidate,
            status,
            timestamp: startTime,
          });
        }
      },
      (err: unknown) => {
        broadcaster.broadcast({
          ...entry,
          state: 'failed',
          error: (err as Error)?.message || 'Network request failed',
          response: {
            status: 0,
            statusText: 'FETCH_ERROR',
            headers: {},
            durationMs: performance.now() - t0,
          },
        });
      },
    );
    return promise;
  } as FetchFn;
  Object.defineProperty(wrapped, DEVTOOLS_FETCH, { value: true });
  return wrapped;
}

export function registerNextDevTools(): void {
  const g = globalThis as unknown as Record<symbol, boolean | undefined> & { fetch?: FetchFn };
  if (g[PATCHED] || typeof g.fetch !== 'function') return;
  g[PATCHED] = true;

  let current: FetchFn = g.fetch;
  const rewrap = (fn: FetchFn): FetchFn => {
    if ((fn as any)[DEVTOOLS_FETCH]) return fn;
    const w = wrapFetch(fn);
    // Carry over Next.js markers (`__nextPatched`, ...) so Next doesn't wrap us a second time.
    Object.assign(w, fn);
    Object.defineProperty(w, DEVTOOLS_FETCH, { value: true });
    return w;
  };
  let wrapped = rewrap(current);

  try {
    // Next.js patches `globalThis.fetch` itself (data cache) *after* instrumentation runs, which would
    // put us underneath it and hide cache HITs. An accessor keeps us the outermost wrapper
    // no matter who assigns `globalThis.fetch` later.
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      enumerable: true,
      get: () => wrapped,
      set: (next: FetchFn) => {
        if (next === wrapped || (next as any)[DEVTOOLS_FETCH]) return;
        current = next;
        wrapped = rewrap(next);
      },
    });
  } catch {
    g.fetch = wrapped;
  }
}
