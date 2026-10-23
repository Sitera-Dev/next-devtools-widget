import { broadcaster } from "./event-broadcaster";
import { genId, safeSerialize } from "../shared/utils";
import type { ActionEntry } from "../shared/types";

export const TRACE_COOKIE_PREFIX = '__ndt_trace_';

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

export async function writeActionCookie(entry: ActionEntry): Promise<void> {
  try {
    const nextHeaders = await getNextHeaders();
    if (!nextHeaders || typeof nextHeaders.cookies !== "function") return;

    const cookieJar = await Promise.resolve(nextHeaders.cookies());
    if (!cookieJar || typeof cookieJar.set !== "function") return;

    const payload: ActionEntry = { ...entry };
    let encoded = encodeURIComponent(JSON.stringify(payload));
    if (encoded.length > 3500) {
      const minimalPayload: ActionEntry = {
        id: entry.id,
        category: "action",
        origin: "server",
        actionName: entry.actionName,
        args: [],
        timestamp: entry.timestamp,
        durationMs: entry.durationMs,
        error: entry.error,
        result: "[result omitted: exceeded cookie size limit]",
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
    // ignore
  }
}

/**
 * Optional: wrap a Server Action to record named invocations (arguments, result, duration).
 *
 * ```ts
 * "use server";
 * export const claim = trackServerAction("claim", async (voucherId: string) => { ... });
 * ```
 */
export function trackServerAction<A extends unknown[], R>(
  actionName: string,
  fn: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    if (!isDevToolsActive()) return fn(...args);
    const t0 = performance.now();
    const timestamp = Date.now();
    const base = {
      id: genId("act"),
      category: "action" as const,
      origin: "server" as const,
      actionName,
      args: (safeSerialize(args) as unknown[]) ?? [],
      timestamp,
    };
    try {
      const result = await fn(...args);
      const entry: ActionEntry = {
        ...base,
        result: safeSerialize(result),
        durationMs: performance.now() - t0,
      };
      if (broadcaster.hasListeners()) {
        broadcaster.broadcast(entry);
      }
      void writeActionCookie(entry);
      return result;
    } catch (err) {
      const e = err as Error;
      const entry: ActionEntry = {
        ...base,
        error: e?.message || String(err),
        errorStack: e?.stack,
        durationMs: performance.now() - t0,
      };
      if (broadcaster.hasListeners()) {
        broadcaster.broadcast(entry);
      }
      void writeActionCookie(entry);
      throw err;
    }
  };
}
