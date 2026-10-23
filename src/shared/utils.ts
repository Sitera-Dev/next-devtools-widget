import type {
  BodyEncoding,
  NetworkRequestInfo,
  RedactRule,
} from './types';

/** Hard cap for text bodies we keep (anything larger is truncated, flagged `bodyTruncated`). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;
/** Binary payloads larger than this are described, not stored. */
export const MAX_BINARY_BYTES = 2 * 1024 * 1024;

export const DEFAULT_REDACT: RedactRule[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  /token|secret|password/i,
];

export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function isRequest(input: unknown): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

/** Safe URL extraction. Never throws, never assumes `input` is a string. */
export function getUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  const url = (input as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' ? url : '';
}

/** Safe method extraction (Next.js router can pass Request-likes with an undefined `method`). */
export function getMethod(input: unknown, init?: RequestInit): string {
  let method = 'GET';
  if (init?.method) method = String(init.method);
  else if (isRequest(input) && input.method) method = String(input.method);
  return method.toUpperCase();
}

export function headersToObject(h: HeadersInit | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  try {
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      h.forEach((v, k) => {
        out[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) out[String(k).toLowerCase()] = String(v);
    } else {
      for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
    }
  } catch {
    /* ignore malformed headers */
  }
  return out;
}

export function getRequestHeaders(input: unknown, init?: RequestInit): Record<string, string> {
  return {
    ...(isRequest(input) ? headersToObject(input.headers) : {}),
    ...headersToObject(init?.headers),
  };
}

/** Internal Next.js / devtools traffic that must never be intercepted or recorded. */
export function isInternalUrl(url: string): boolean {
  return (
    !url ||
    url.includes('/_next/') ||
    url.includes('/__nextjs') ||
    url.includes('/__devtools') ||
    url.includes('/next-devtools') ||
    url.includes('_rsc=')
  );
}

/** Check both URL and headers for Next.js internal router traffic (RSC prefetch/navigation) */
export function isInternalRequest(url: string, headers?: Record<string, string>): boolean {
  if (isInternalUrl(url)) return true;
  if (!headers) return false;
  // Next.js RSC router prefetch / router navigation (unless it's a Server Action)
  if (!headers['next-action']) {
    if (headers['rsc'] === '1' || headers['next-router-prefetch'] || headers['next-router-state-tree']) {
      return true;
    }
  }
  return false;
}

export function describeBody(
  body: BodyInit | null | undefined,
): Pick<NetworkRequestInfo, 'body' | 'bodyForm' | 'bodyNote'> {
  if (body == null) return {};
  if (typeof body === 'string') return { body };
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { body: body.toString() };
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const form: Array<[string, string]> = [];
    body.forEach((v, k) => form.push([k, typeof v === 'string' ? v : `[File ${v.name}]`]));
    return { bodyForm: form };
  }
  return { bodyNote: '[binary body omitted]' };
}

/** Clone a Request so its body can be read later without consuming the one passed to fetch. */
export function cloneRequestForBody(input: unknown, init: RequestInit | undefined, method: string): Request | null {
  if (init?.body != null || !isRequest(input) || method === 'GET' || method === 'HEAD') return null;
  try {
    return input.clone();
  } catch {
    return null;
  }
}

export function safeClone(res: Response): Response | null {
  try {
    return res.clone();
  } catch {
    return null;
  }
}

export function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1000) return `${n}B`;
  if (n < 1000 * 1000) return `${(n / 1000).toFixed(1)}kB`;
  return `${(n / 1000 / 1000).toFixed(1)}MB`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function isTextual(contentType: string): boolean {
  return /^(text\/|application\/(json|[\w.+-]*\+json|xml|[\w.+-]*\+xml|javascript|x-www-form-urlencoded|graphql|x-ndjson)|image\/svg)/i.test(
    contentType,
  );
}

export interface CapturedBody {
  body: string | null;
  encoding?: BodyEncoding;
  truncated?: boolean;
  size?: number;
  contentType: string;
}

/** Read a (cloned) response body once, with guards for streams, binaries and huge payloads. */
export async function captureResponseBody(res: Response): Promise<CapturedBody> {
  const contentType = res.headers.get('content-type') || '';
  const len = Number(res.headers.get('content-length'));
  const knownLen = Number.isFinite(len) && res.headers.has('content-length') ? len : undefined;

  if (/text\/event-stream/i.test(contentType)) {
    return { body: '[event stream · not captured]', contentType, size: knownLen };
  }
  if (!res.body) return { body: null, contentType, size: 0 };
  if (knownLen != null && knownLen > MAX_BODY_BYTES) {
    return { body: `[Body too large to capture · ${formatBytes(knownLen)}]`, contentType, size: knownLen, truncated: true };
  }

  try {
    if (!contentType || isTextual(contentType) || /x-component/i.test(contentType)) {
      const text = await res.text();
      const truncated = text.length > MAX_BODY_BYTES;
      return {
        body: truncated ? text.slice(0, MAX_BODY_BYTES) : text,
        truncated,
        size: knownLen ?? text.length,
        contentType,
      };
    }
    if (knownLen != null && knownLen > MAX_BINARY_BYTES) {
      return { body: `[binary · ${contentType} · ${formatBytes(knownLen)}]`, contentType, size: knownLen };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BINARY_BYTES) {
      return { body: `[binary · ${contentType} · ${formatBytes(buf.byteLength)}]`, contentType, size: buf.byteLength };
    }
    return { body: bufferToBase64(buf), encoding: 'base64', size: buf.byteLength, contentType };
  } catch {
    return { body: '[Unreadable stream]', contentType, size: knownLen };
  }
}

export function isSensitive(name: string, rules: RedactRule[]): boolean {
  const n = name.toLowerCase();
  return rules.some((r) => {
    if (typeof r === 'string') return n === r.toLowerCase();
    r.lastIndex = 0;
    return r.test(name);
  });
}

/** Deep-redact a parsed JSON value by key (only primitive values are masked). */
export function redactValue(value: unknown, rules: RedactRule[], mask = '<REDACTED>', key?: string): unknown {
  if (key !== undefined && isSensitive(key, rules) && (value === null || typeof value !== 'object')) return mask;
  if (Array.isArray(value)) return value.map((x) => redactValue(x, rules, mask));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, redactValue(x, rules, mask, k)]));
  }
  return value;
}

/** Deep-redact JSON text by key. Returns the input unchanged when it is not JSON. */
export function redactJsonText(text: string, rules: RedactRule[], mask = '<REDACTED>'): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(text), rules, mask));
  } catch {
    return text;
  }
}

/** JSON-safe deep copy of arbitrary values (server action args/results). Never throws. */
export function safeSerialize(value: unknown, maxChars = 200_000): unknown {
  try {
    const s = JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
      if (typeof FormData !== 'undefined' && v instanceof FormData) {
        const o: Record<string, string> = {};
        v.forEach((x, k) => {
          o[k] = typeof x === 'string' ? x : `[File ${x.name}]`;
        });
        return o;
      }
      return v;
    });
    if (s === undefined) return undefined;
    if (s.length > maxChars) return '[Value too large]';
    return JSON.parse(s);
  } catch {
    return '[Unserializable]';
  }
}
