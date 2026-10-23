import React from 'react';

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
/** Server diagnostics, pushed over SSE as a dedicated `system` event (never stored server side). */
interface SystemInfo {
    runtime: string;
    nodeVersion: string;
    nextVersion: string;
    nodeEnv: string;
    platform: string;
    arch: string;
    pid: number;
    uptimeSec: number;
    memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
    env?: Record<string, string>;
    updatedAt: number;
}
type RedactRule = string | RegExp;

type TabId = 'network' | 'actions' | 'cache' | 'system';
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type Theme = 'light' | 'dark' | 'system';

interface NextDevToolsProps {
    /** Initial corner. A user drag wins (and is remembered) after the first interaction. */
    position?: Corner;
    theme?: Theme;
    defaultOpen?: boolean;
    /** e.g. `alt+d`, `ctrl+shift+k` */
    hotkey?: string;
    /** Ring buffer size kept in the browser. */
    maxEntries?: number;
    /** Header / JSON field names (string = exact, RegExp = pattern) masked in the UI. */
    redact?: RedactRule[];
    tabs?: TabId[];
    /** Defaults to `process.env.NODE_ENV === 'development'`. */
    enabled?: boolean;
}
declare function NextDevTools$1({ position, theme, defaultOpen, hotkey, maxEntries, redact, tabs, enabled, }: NextDevToolsProps): React.JSX.Element | null;

/**
 * Scans document.cookie for ephemeral traces left by server-side fetch or actions
 * in serverless environments (e.g. Vercel Lambdas), emits them to the DevTools store,
 * and expires the cookies immediately.
 */
declare function drainTraceCookies(emit: (entry: DevToolsEntry) => void): void;

declare function drainSsrTraces(emit: (entry: DevToolsEntry) => void): void;
/**
 * Attaches a MutationObserver to watch for any dynamically streamed SSR scripts
 * (e.g. from Suspense boundaries or streaming RSC chunks).
 */
declare function setupSsrObserver(emit: (entry: DevToolsEntry) => void): () => void;

declare function NextDevTools(props: NextDevToolsProps): React.JSX.Element | null;

export { type ActionEntry, type CacheEntry, type Corner, type DevToolsEntry, type NetworkEntry, NextDevTools, NextDevTools$1 as NextDevToolsClient, type NextDevToolsProps, type RedactRule, type SystemInfo, type TabId, drainSsrTraces, drainTraceCookies, setupSsrObserver };
