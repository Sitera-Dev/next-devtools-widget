import type { NetworkEntry } from "../shared/types";

interface SsrStoreState {
  buffer: NetworkEntry[];
  inFlight: Set<Promise<unknown>>;
}

const SSR_STORE_KEY = Symbol.for("next-devtools.ssr-store");
const g = globalThis as unknown as Record<symbol, SsrStoreState | undefined>;

function getStore(): SsrStoreState {
  return (g[SSR_STORE_KEY] ||= {
    buffer: [],
    inFlight: new Set(),
  });
}

export function trackInFlightFetch(promise: Promise<unknown>): void {
  const s = getStore();
  s.inFlight.add(promise);
  promise.catch(() => {}).finally(() => {
    s.inFlight.delete(promise);
  });
}

export function recordSsrTrace(entry: NetworkEntry): void {
  const s = getStore();
  const idx = s.buffer.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    s.buffer[idx] = entry;
  } else {
    s.buffer.push(entry);
    if (s.buffer.length > 50) {
      s.buffer.splice(0, s.buffer.length - 50);
    }
  }
}

export function getRecentSsrTraces(): NetworkEntry[] {
  return getStore().buffer.slice();
}

/**
 * Awaits currently active in-flight fetches so that when <NextDevTools />
 * renders, it captures all fetches triggered by child server components.
 * Uses performance.now() to comply with Next.js prerender guidelines.
 * Times out after timeoutMs to ensure rendering is never blocked.
 */
export async function waitForSsrTraces(timeoutMs = 1500): Promise<NetworkEntry[]> {
  const s = getStore();
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    if (s.inFlight.size === 0) {
      // Allow a brief grace period (30ms) for concurrent Server Components
      // (e.g. after `await connection()`, `await cookies()`, or dynamic imports)
      // to start their fetch calls, or for chained fetches to start.
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (s.inFlight.size === 0) {
        break;
      }
    }

    await Promise.race([
      Promise.all(Array.from(s.inFlight)),
      new Promise((resolve) => setTimeout(resolve, 25)),
    ]);
  }

  const traces = s.buffer.slice();
  s.buffer.length = 0;
  return traces;
}

export function clearSsrTraces(): void {
  const s = getStore();
  s.buffer.length = 0;
  s.inFlight.clear();
}
