type RequestOrigin = 'server' | 'client';
type BodyEncoding = 'text' | 'base64';
interface NetworkRequestInfo {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | null;
    /** FormData bodies, as key/value pairs (files are described by name). */
    bodyForm?: Array<[string, string]>;
    /** Human readable note for bodies that cannot be represented (Blob, stream, ...). */
    bodyNote?: string;
    timestamp: number;
}
interface NetworkResponseInfo {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string | null;
    /** `base64` for binary payloads captured as a data blob. Defaults to `text`. */
    bodyEncoding?: BodyEncoding;
    bodyTruncated?: boolean;
    contentType?: string;
    /** Payload size in bytes (content-length when known). */
    size?: number;
    durationMs: number;
    /** Time until response headers arrived (time-to-first-byte). */
    ttfbMs?: number;
    /** Time spent reading the body after the headers arrived. */
    downloadMs?: number;
}
interface NetworkEntry {
    id: string;
    category: 'network';
    origin: RequestOrigin;
    request: NetworkRequestInfo;
    response?: NetworkResponseInfo;
    error?: string;
    state: 'pending' | 'completed' | 'failed';
}
interface ActionEntry {
    id: string;
    category: 'action';
    origin?: RequestOrigin;
    actionName: string;
    args: any[];
    result?: any;
    error?: string;
    errorStack?: string;
    durationMs: number;
    timestamp: number;
}
interface CacheEntry {
    id: string;
    category: 'cache';
    key: string;
    url?: string;
    tags: string[];
    revalidate?: number | false;
    status: 'HIT' | 'MISS' | 'STALE' | 'REVALIDATED';
    timestamp: number;
}
type DevToolsEntry = NetworkEntry | ActionEntry | CacheEntry;

declare function registerNextDevTools(): void;

/**
 * Optional: wrap a Server Action to record named invocations (arguments, result, duration).
 *
 * ```ts
 * "use server";
 * export const claim = trackServerAction("claim", async (voucherId: string) => { ... });
 * ```
 */
declare function trackServerAction<A extends unknown[], R>(actionName: string, fn: (...args: A) => Promise<R> | R): (...args: A) => Promise<R>;

declare function recordSsrTrace(entry: NetworkEntry): void;
declare function getRecentSsrTraces(): NetworkEntry[];
/**
 * Awaits currently active in-flight fetches so that when <NextDevTools />
 * renders, it captures all fetches triggered by child server components.
 * Times out after timeoutMs to ensure rendering is never blocked.
 */
declare function waitForSsrTraces(timeoutMs?: number): Promise<NetworkEntry[]>;
declare function clearSsrTraces(): void;

export { type ActionEntry, type CacheEntry, type DevToolsEntry, type NetworkEntry, clearSsrTraces, getRecentSsrTraces, recordSsrTrace, registerNextDevTools, trackServerAction, waitForSsrTraces };
