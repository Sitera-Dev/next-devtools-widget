import { recordSsrTrace, trackInFlightFetch } from './ssr-store';
import { AsyncLocalStorage } from 'node:async_hooks';
import { broadcaster } from "./event-broadcaster";
import type { CacheEntry, NetworkEntry } from "../shared/types";
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
} from "../shared/utils";

type FetchFn = typeof fetch;

const PATCHED = Symbol.for("next-devtools.fetch-patched");
const DEVTOOLS_FETCH = Symbol.for("next-devtools.fetch-wrapped");
const fetchContext = new AsyncLocalStorage<boolean>();

export const TRACE_COOKIE_PREFIX = '__ndt_trace_';

function isCacheable(init: RequestInit | undefined): { tags: string[]; revalidate?: number | false } | null {
  const next = (init as { next?: { tags?: string[]; revalidate?: number | false } } | undefined)?.next;
  if (next?.tags || next?.revalidate !== undefined || init?.cache === "force-cache" || init?.cache === "only-if-cached") {
    return { tags: next?.tags ?? [], revalidate: next?.revalidate };
  }
  return null;
}

function isDevToolsActive(): boolean {
  return (
    broadcaster.hasListeners() ||
    process.env.NEXT_DEVTOOLS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true" ||
    process.env.NODE_ENV === "development"
  );
}

let nextHeadersPromise: Promise<typeof import('next/headers') | null> | null = null;
function getNextHeaders(): Promise<typeof import('next/headers') | null> {
  if (!nextHeadersPromise) {
    nextHeadersPromise = import('next/headers').catch(() => null);
  }
  return nextHeadersPromise;
}

export async function writeTraceCookie(entry: NetworkEntry): Promise<void> {
  try {
    const nextHeaders = await getNextHeaders();
    if (!nextHeaders || typeof nextHeaders.cookies !== "function") return;

    const cookieJar = await Promise.resolve(nextHeaders.cookies());
    if (!cookieJar || typeof cookieJar.set !== "function") return;

    // Truncate response body if needed to avoid 4KB cookie header limit
    const body = entry.response?.body;
    const truncatedBody =
      body && body.length > 2000
        ? body.slice(0, 2000) + "... [truncated for cookie transport]"
        : body;

    const payload: NetworkEntry = {
      ...entry,
      response: entry.response
        ? {
            ...entry.response,
            body: truncatedBody ?? null,
          }
        : undefined,
    };

    let serialized = JSON.stringify(payload);
    let encoded = encodeURIComponent(serialized);

    // If encoded length is > 3500 bytes, trim request/response further
    if (encoded.length > 3500) {
      const minimalPayload: NetworkEntry = {
        id: entry.id,
        category: "network",
        origin: "server",
        state: entry.state,
        error: entry.error,
        request: {
          url: entry.request.url,
          method: entry.request.method,
          headers: {},
          timestamp: entry.request.timestamp,
        },
        response: entry.response
          ? {
              status: entry.response.status,
              statusText: entry.response.statusText,
              headers: {},
              durationMs: entry.response.durationMs,
              ttfbMs: entry.response.ttfbMs,
              downloadMs: entry.response.downloadMs,
              body: "[body omitted: exceeded cookie size limit]",
            }
          : undefined,
      };
      encoded = encodeURIComponent(JSON.stringify(minimalPayload));
    }

    const cookieName = `${TRACE_COOKIE_PREFIX}${entry.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12)}`;

    cookieJar.set(cookieName, encoded, {
      path: '/',
      maxAge: 60,
      httpOnly: false,
      sameSite: 'lax',
    });
  } catch {
    // In read-only Server Component renders or environments without cookie context,
    // next/headers throws. Silently swallow to prevent breaking any application flow.
  }
}

function wrapFetch(original: FetchFn): FetchFn {
  const wrapped = function devtoolsFetch(this: unknown, ...args: Parameters<FetchFn>): Promise<Response> {
    // If we are already executing inside a devtoolsFetch call on this async stack, pass through directly
    if (fetchContext.getStore()) {
      return original.apply(this, args);
    }

    const [input, init] = args;
    // Nobody is watching and devtools is not enabled: zero overhead, zero allocation.
    if (!isDevToolsActive()) return original.apply(this, args);

    const url = getUrl(input);
    const headers = getRequestHeaders(input, init);
    if (isInternalRequest(url, headers)) return original.apply(this, args);

    const method = getMethod(input, init);
    const startTime = Date.now();
    const t0 = performance.now();
    const id = genId("srv");
    const reqClone = cloneRequestForBody(input, init, method);

    const entry: NetworkEntry = {
      id,
      category: "network",
      origin: "server",
      state: "pending",
      request: {
        url,
        method,
        headers,
        ...describeBody(init?.body),
        timestamp: startTime,
      },
    };
    if (broadcaster.hasListeners()) {
      broadcaster.broadcast(entry);
    }

    const promise = fetchContext.run(true, () => original.apply(this, args));
    trackInFlightFetch(promise);

    // Observe in the background so the caller promise is returned untouched.
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

        const completedEntry: NetworkEntry = {
          ...entry,
          request,
          state: "completed",
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
        };

        recordSsrTrace(completedEntry);
        if (broadcaster.hasListeners()) {
          broadcaster.broadcast(completedEntry);
        }

        // Bridge serverless traces to client via ephemeral cookie (Solution 1)
        void writeTraceCookie(completedEntry);

        const cache = isCacheable(init);
        if (cache) {
          const header = response.headers.get("x-nextjs-cache");
          // Heuristic: Next data cache answers without touching the network.
          const status: CacheEntry["status"] =
            header === "HIT" || header === "MISS" || header === "STALE"
              ? header
              : ttfbMs < 2
                ? "HIT"
                : "MISS";
          if (broadcaster.hasListeners()) {
            broadcaster.broadcast({
              id: genId("cch"),
              category: "cache",
              key: `${method} ${url}`,
              url,
              tags: cache.tags,
              revalidate: cache.revalidate,
              status,
              timestamp: startTime,
            });
          }
        }
      },
      (err: unknown) => {
        const failedEntry: NetworkEntry = {
          ...entry,
          state: "failed",
          error: (err as Error)?.message || "Network request failed",
          response: {
            status: 0,
            statusText: "FETCH_ERROR",
            headers: {},
            durationMs: performance.now() - t0,
          },
        };

        recordSsrTrace(failedEntry);
        if (broadcaster.hasListeners()) {
          broadcaster.broadcast(failedEntry);
        }

        // Bridge serverless traces to client via ephemeral cookie (Solution 1)
        void writeTraceCookie(failedEntry);
      },
    );
    return promise;
  } as FetchFn;
  Object.defineProperty(wrapped, DEVTOOLS_FETCH, { value: true });
  return wrapped;
}

export function registerNextDevTools(): void {
  const g = globalThis as unknown as Record<symbol, boolean | undefined> & { fetch?: FetchFn };
  if (g[PATCHED] || typeof g.fetch !== "function") return;
  g[PATCHED] = true;


  let current: FetchFn = g.fetch;
  const rewrap = (fn: FetchFn): FetchFn => {
    if ((fn as any)[DEVTOOLS_FETCH]) return fn;
    const w = wrapFetch(fn);
    // Carry over Next.js markers (__nextPatched, ...) so Next doesn't wrap us a second time.
    Object.assign(w, fn);
    Object.defineProperty(w, DEVTOOLS_FETCH, { value: true });
    return w;
  };
  let wrapped = rewrap(current);

  try {
    // Next.js patches globalThis.fetch itself (data cache) after instrumentation runs, which would
    // put us underneath it and hide cache HITs. An accessor keeps us the outermost wrapper
    // no matter who assigns globalThis.fetch later.
    Object.defineProperty(globalThis, "fetch", {
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
