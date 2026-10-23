import type { NetworkEntry, NetworkRequestInfo, RedactRule } from '../../shared/types';
import { isSensitive, redactJsonText } from '../../shared/utils';

export type CurlFlavor = 'bash' | 'cmd' | 'powershell';

export interface CurlOptions {
  /** When set, matching header values / JSON body fields become `<REDACTED>`. */
  redact?: RedactRule[] | null;
  /** Keep the `cookie` header (skipped by default, like browser-managed headers). */
  includeCookie?: boolean;
  /** Base used to resolve relative URLs. Defaults to `location.origin`. */
  origin?: string;
}

const SKIP_HEADERS = /^(host|content-length|connection|accept-encoding|origin|referer|sec-.*)$/i;
const REDACTED = '<REDACTED>';

export function resolveUrl(url: string, origin?: string): string {
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function prepare(req: NetworkRequestInfo, opts: CurlOptions) {
  const headers: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (SKIP_HEADERS.test(key)) continue;
    if (key === 'cookie' && !opts.includeCookie) continue;
    headers.push([key, opts.redact && isSensitive(key, opts.redact) ? REDACTED : v]);
  }
  let body = req.body ?? null;
  if (body && opts.redact) body = redactJsonText(body, opts.redact);
  return { url: resolveUrl(req.url, opts.origin), headers, body };
}

// ---------------- quoting ----------------

export function bashQuote(s: string): string {
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(s)) {
    // $'...' so newlines / control characters survive the shell.
    const esc = s.replace(/[\\'\x00-\x1f\x7f]/g, (c) => {
      if (c === '\\') return '\\\\';
      if (c === "'") return "\\'";
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
    });
    return `$'${esc}'`;
  }
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function cmdQuote(s: string): string {
  const esc = s
    .replace(/"/g, '\\"')
    .replace(/%/g, '"^%"')
    .replace(/\r?\n/g, '"^\n\n"');
  return `"${esc}"`;
}

export function psQuote(s: string): string {
  return `'${s.replace(/['\u2018\u2019\u201a\u201b]/g, (c) => c + c)}'`;
}

// ---------------- generators ----------------

export function buildCurl(req: NetworkRequestInfo, flavor: CurlFlavor = 'bash', opts: CurlOptions = {}): string {
  const { url, headers, body } = prepare(req, opts);
  const method = req.method.toUpperCase();
  const form = req.bodyForm;
  const lines: string[] = [];
  const comment = req.bodyNote ? req.bodyNote.replace(/^\[|\]$/g, '') : '';

  if (flavor === 'powershell') {
    const parts = [`Invoke-WebRequest -UseBasicParsing -Uri ${psQuote(url)}`];
    if (method !== 'GET') parts.push(`-Method ${psQuote(method)}`);
    const ct = headers.find(([k]) => k === 'content-type');
    const rest = headers.filter(([k]) => k !== 'content-type');
    if (rest.length) {
      parts.push(`-Headers @{\n${rest.map(([k, v]) => `  ${psQuote(k)}=${psQuote(v)}`).join('\n')}\n}`);
    }
    if (ct && !form) parts.push(`-ContentType ${psQuote(ct[1])}`);
    if (form) parts.push(`-Form @{\n${form.map(([k, v]) => `  ${psQuote(k)}=${psQuote(v)}`).join('\n')}\n}`);
    else if (body != null) parts.push(`-Body ${psQuote(body)}`);
    const out = parts.join(' `\n');
    return comment ? `# ${comment}\n${out}` : out;
  }

  const q = flavor === 'cmd' ? cmdQuote : bashQuote;
  const cont = flavor === 'cmd' ? ' ^' : ' \\';
  lines.push(`curl ${q(url)}`);
  if (method === 'HEAD') lines.push('-I');
  else if (method !== 'GET') lines.push(`-X ${method}`);
  for (const [k, v] of headers) {
    if (form && k === 'content-type') continue; // curl sets the multipart boundary itself
    lines.push(`-H ${q(`${k}: ${v}`)}`);
  }
  if (form) for (const [k, v] of form) lines.push(`-F ${q(`${k}=${v}`)}`);
  else if (body != null) lines.push(`--data-raw ${q(body)}`);
  lines.push('--compressed');

  const out = lines.map((l, i) => (i === 0 ? l : `  ${l}`)).join(`${cont}\n`);
  if (!comment) return out;
  return `${flavor === 'cmd' ? 'REM' : '#'} ${comment}\n${out}`;
}

export function buildFetchSnippet(req: NetworkRequestInfo, opts: CurlOptions = {}): string {
  const { url, headers, body } = prepare(req, opts);
  const init: Record<string, unknown> = { method: req.method.toUpperCase() };
  if (headers.length) init.headers = Object.fromEntries(headers);
  if (body != null) init.body = body;
  return `fetch(${JSON.stringify(url)}, ${JSON.stringify(init, null, 2)});`;
}

export function buildHarEntry(entry: NetworkEntry, opts: CurlOptions = {}): object {
  const { request: req, response: res } = entry;
  const { url, headers, body } = prepare(req, { ...opts, includeCookie: true });
  let queryString: Array<{ name: string; value: string }> = [];
  try {
    queryString = [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    /* relative / invalid URL */
  }
  const mimeType = headers.find(([k]) => k === 'content-type')?.[1] ?? '';
  const wait = res?.ttfbMs ?? 0;
  const receive = res?.downloadMs ?? 0;
  return {
    startedDateTime: new Date(req.timestamp).toISOString(),
    time: res?.durationMs ?? 0,
    request: {
      method: req.method,
      url,
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: headers.map(([name, value]) => ({ name, value })),
      queryString,
      headersSize: -1,
      bodySize: body ? body.length : 0,
      ...(body != null ? { postData: { mimeType, text: body } } : {}),
    },
    response: {
      status: res?.status ?? 0,
      statusText: res?.statusText ?? '',
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: Object.entries(res?.headers ?? {}).map(([name, value]) => ({ name, value })),
      content: {
        size: res?.size ?? 0,
        mimeType: res?.contentType ?? '',
        ...(res?.body != null ? { text: res.body, ...(res.bodyEncoding === 'base64' ? { encoding: 'base64' } : {}) } : {}),
      },
      redirectURL: res?.headers.location ?? '',
      headersSize: -1,
      bodySize: res?.size ?? -1,
    },
    cache: {},
    timings: { send: 0, wait, receive },
  };
}
