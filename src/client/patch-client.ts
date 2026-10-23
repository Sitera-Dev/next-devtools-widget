import type { ActionEntry, DevToolsEntry, NetworkEntry } from '../shared/types';
import {
  captureResponseBody,
  describeBody,
  genId,
  getMethod,
  getRequestHeaders,
  getUrl,
  headersToObject,
  isInternalUrl,
  safeClone,
} from '../shared/utils';

const PATCHED = '__NEXT_DEVTOOLS_FETCH_PATCHED__';

type FetchFn = typeof fetch;

/**
 * Safe window.fetch proxy.
 *
 * Rules (violating any of them breaks the Next.js router):
 *  - arguments are forwarded untouched, the caller gets the *original* promise back;
 *  - Next.js internals (`/_next/*`, HMR, RSC prefetch, devtools SSE) are never inspected;
 *  - nothing is assumed about `input` (Request-likes with undefined `method` exist).
 */
export function setupClientFetchProxy(emit: (entry: DevToolsEntry) => void): void {
  const w = window as unknown as Record<string, unknown> & { fetch?: FetchFn };
  if (typeof w.fetch !== 'function' || w[PATCHED]) return;
  w[PATCHED] = true;

  const originalFetch: FetchFn = w.fetch;

  w.fetch = function devtoolsFetch(...args: Parameters<FetchFn>): Promise<Response> {
    const promise = originalFetch.apply(window, args);
    try {
      const url = getUrl(args[0]);
      if (!isInternalUrl(url)) observe(url, args, promise, emit);
    } catch {
      /* observing must never affect the caller */
    }
    return promise;
  } as FetchFn;
}

function observe(
  url: string,
  [input, init]: Parameters<FetchFn>,
  promise: Promise<Response>,
  emit: (e: DevToolsEntry) => void,
): void {
  const method = getMethod(input, init);
  const headers = getRequestHeaders(input, init);
  const startTime = Date.now();
  // The call already started; keep the clock as close to it as possible.
  const t0 = performance.now();
  const actionId = headers['next-action'];
  const id = genId(actionId ? 'act' : 'cli');
  const request = { url, method, headers, ...describeBody(init?.body), timestamp: startTime };

  const entry: NetworkEntry = { id, category: 'network', origin: 'client', state: 'pending', request };
  emit(entry);

  const actionBase = (): Omit<ActionEntry, 'durationMs'> => ({
    id: `act_${id}`,
    category: 'action',
    origin: 'client',
    actionName: `Server Action ${actionId!.slice(0, 8)}`,
    args: [request.body ?? request.bodyForm ?? request.bodyNote ?? null],
    timestamp: startTime,
  });

  promise.then(
    async (response) => {
      const ttfbMs = performance.now() - t0;
      const clone = safeClone(response);
      const tBody = performance.now();
      const captured = clone ? await captureResponseBody(clone) : null;
      const now = performance.now();

      emit({
        ...entry,
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

      if (actionId) {
        emit({
          ...actionBase(),
          result: captured?.body ?? null,
          error: response.ok ? undefined : `${response.status} ${response.statusText}`,
          durationMs: now - t0,
        });
      }
    },
    (err: unknown) => {
      const message = (err as Error)?.message || 'Client fetch failed';

      emit({
        ...entry,
        state: 'failed',
        error: (err as Error)?.name === 'AbortError' ? 'Aborted' : message,
        response: { status: 0, statusText: 'CLIENT_ERROR', headers: {}, durationMs: performance.now() - t0 },
      });

      if (actionId) {
        emit({ ...actionBase(), error: message, durationMs: performance.now() - t0 });
      }
    },
  );
}
