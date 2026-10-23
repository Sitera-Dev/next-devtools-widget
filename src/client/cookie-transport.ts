import type { DevToolsEntry } from "../shared/types";

export const TRACE_COOKIE_PREFIX = '__ndt_trace_';

/**
 * Scans document.cookie for ephemeral traces left by server-side fetch or actions
 * in serverless environments (e.g. Vercel Lambdas), emits them to the DevTools store,
 * and expires the cookies immediately.
 */
export function drainTraceCookies(emit: (entry: DevToolsEntry) => void): void {
  if (typeof document === "undefined" || !document.cookie) return;

  const rawCookies = document.cookie;
  if (!rawCookies.includes(TRACE_COOKIE_PREFIX)) return;

  const pairs = rawCookies.split(";");
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed.startsWith(TRACE_COOKIE_PREFIX)) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const name = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    try {
      const decoded = decodeURIComponent(val);
      const entry = JSON.parse(decoded) as DevToolsEntry;
      if (entry && typeof entry === "object" && entry.id && entry.category) {
        emit(entry);
      }
    } catch {
      // Malformed trace cookie, ignore
    } finally {
      // Immediately expire and clear from browser
      document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    }
  }
}
