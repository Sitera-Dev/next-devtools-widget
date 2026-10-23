export type DevToolsCategory = 'network' | 'action' | 'cache' | 'system';
export type RequestOrigin = 'server' | 'client';
export type BodyEncoding = 'text' | 'base64';

export interface NetworkRequestInfo {
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

export interface NetworkResponseInfo {
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

export interface NetworkEntry {
  id: string;
  category: 'network';
  origin: RequestOrigin;
  request: NetworkRequestInfo;
  response?: NetworkResponseInfo;
  error?: string;
  state: 'pending' | 'completed' | 'failed';
}

export interface ActionEntry {
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

export interface CacheEntry {
  id: string;
  category: 'cache';
  key: string;
  url?: string;
  tags: string[];
  revalidate?: number | false;
  status: 'HIT' | 'MISS' | 'STALE' | 'REVALIDATED';
  timestamp: number;
}

export type DevToolsEntry = NetworkEntry | ActionEntry | CacheEntry;

/** Server diagnostics, pushed over SSE as a dedicated `system` event (never stored server side). */
export interface SystemInfo {
  runtime: string;
  nodeVersion: string;
  nextVersion: string;
  nodeEnv: string;
  platform: string;
  arch: string;
  pid: number;
  uptimeSec: number;
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  env?: Record<string, string>;
  updatedAt: number;
}

export type RedactRule = string | RegExp;

export function entryTimestamp(entry: DevToolsEntry): number {
  return entry.category === 'network' ? entry.request.timestamp : entry.timestamp;
}
