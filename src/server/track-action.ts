import { broadcaster } from './event-broadcaster';
import { genId, safeSerialize } from '../shared/utils';

/**
 * Optional: wrap a Server Action to record named invocations (arguments, result, duration).
 *
 * ```ts
 * 'use server';
 * export const claim = trackServerAction('claim', async (voucherId: string) => { ... });
 * ```
 */
export function trackServerAction<A extends unknown[], R>(
  actionName: string,
  fn: (...args: A) => Promise<R> | R,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    if (!broadcaster.hasListeners()) return fn(...args);
    const t0 = performance.now();
    const timestamp = Date.now();
    const base = {
      id: genId('act'),
      category: 'action' as const,
      origin: 'server' as const,
      actionName,
      args: (safeSerialize(args) as unknown[]) ?? [],
      timestamp,
    };
    try {
      const result = await fn(...args);
      broadcaster.broadcast({ ...base, result: safeSerialize(result), durationMs: performance.now() - t0 });
      return result;
    } catch (err) {
      const e = err as Error;
      broadcaster.broadcast({
        ...base,
        error: e?.message || String(err),
        errorStack: e?.stack,
        durationMs: performance.now() - t0,
      });
      throw err;
    }
  };
}
