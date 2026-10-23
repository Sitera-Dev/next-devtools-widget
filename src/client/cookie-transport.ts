import type { DevToolsEntry } from "../shared/types";

export const TRACE_COOKIE_PREFIX = '__ndt_trace_';

function decodeB64(str: string): string {
  try {
    const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return decodeURIComponent(escape(binary));
  } catch {
    return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  }
}

async function decompressDeflate(str: string): Promise<string> {
  const binary = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return new TextDecoder().decode(out);
  }

  throw new Error("DecompressionStream unavailable");
}

export async function parseCookieValue(val: string): Promise<DevToolsEntry | null> {
  try {
    let jsonString = "";
    if (val.startsWith("z:")) {
      jsonString = await decompressDeflate(val.slice(2));
    } else if (val.startsWith("b:")) {
      jsonString = decodeB64(val.slice(2));
    } else {
      // Legacy URI-encoded format
      jsonString = decodeURIComponent(val);
    }

    const entry = JSON.parse(jsonString) as DevToolsEntry;
    if (entry && typeof entry === "object" && entry.id && entry.category) {
      return entry;
    }
    return null;
  } catch {
    return null;
  }
}

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

    // Expire immediately so subsequent scans never process this cookie again
    document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;

    try {
      if (val.startsWith("z:")) {
        // Async decompression for deflated payloads
        void parseCookieValue(val)
          .then((entry) => {
            if (entry) emit(entry);
          })
          .catch(() => {});
      } else {
        // Synchronous decoding for base64url or legacy URI-encoded format
        const jsonString = val.startsWith("b:") ? decodeB64(val.slice(2)) : decodeURIComponent(val);
        const entry = JSON.parse(jsonString) as DevToolsEntry;
        if (entry && typeof entry === "object" && entry.id && entry.category) {
          emit(entry);
        }
      }
    } catch {
      // Malformed trace cookie, ignore
    }
  }
}
