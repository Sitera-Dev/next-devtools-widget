"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/index.ts
var server_exports = {};
__export(server_exports, {
  clearSsrTraces: () => clearSsrTraces,
  getRecentSsrTraces: () => getRecentSsrTraces,
  recordSsrTrace: () => recordSsrTrace,
  registerNextDevTools: () => registerNextDevTools,
  trackServerAction: () => trackServerAction,
  waitForSsrTraces: () => waitForSsrTraces
});
module.exports = __toCommonJS(server_exports);

// src/server/ssr-store.ts
var SSR_STORE_KEY = /* @__PURE__ */ Symbol.for("next-devtools.ssr-store");
var g = globalThis;
function getStore() {
  return g[SSR_STORE_KEY] || (g[SSR_STORE_KEY] = {
    buffer: [],
    inFlight: /* @__PURE__ */ new Set()
  });
}
function trackInFlightFetch(promise) {
  const s = getStore();
  s.inFlight.add(promise);
  promise.catch(() => {
  }).finally(() => {
    s.inFlight.delete(promise);
  });
}
function recordSsrTrace(entry) {
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
function getRecentSsrTraces() {
  return getStore().buffer.slice();
}
async function waitForSsrTraces(timeoutMs = 1500) {
  const s = getStore();
  const deadline = Date.now() + timeoutMs;
  while (s.inFlight.size > 0 && Date.now() < deadline) {
    await Promise.race([
      Promise.all(Array.from(s.inFlight)),
      new Promise((resolve) => setTimeout(resolve, 20))
    ]);
  }
  return s.buffer.slice();
}
function clearSsrTraces() {
  const s = getStore();
  s.buffer.length = 0;
  s.inFlight.clear();
}

// src/server/patch-fetch.ts
var import_node_async_hooks = require("async_hooks");

// src/server/event-broadcaster.ts
var KEY = /* @__PURE__ */ Symbol.for("next-devtools.broadcaster");
var g2 = globalThis;
var state = g2[KEY] || (g2[KEY] = { listeners: /* @__PURE__ */ new Set() });
var broadcaster = {
  subscribe(listener) {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
  hasListeners() {
    return state.listeners.size > 0;
  },
  broadcast(entry) {
    for (const listener of state.listeners) {
      try {
        listener(entry);
      } catch {
      }
    }
  }
};

// src/shared/utils.ts
var MAX_BODY_BYTES = 10 * 1024 * 1024;
var MAX_BINARY_BYTES = 2 * 1024 * 1024;
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
function isRequest(input) {
  return typeof Request !== "undefined" && input instanceof Request;
}
function getUrl(input) {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
  const url = input?.url;
  return typeof url === "string" ? url : "";
}
function getMethod(input, init) {
  let method = "GET";
  if (init?.method) method = String(init.method);
  else if (isRequest(input) && input.method) method = String(input.method);
  return method.toUpperCase();
}
function headersToObject(h) {
  const out = {};
  if (!h) return out;
  try {
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      h.forEach((v, k) => {
        out[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) out[String(k).toLowerCase()] = String(v);
    } else {
      for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
    }
  } catch {
  }
  return out;
}
function getRequestHeaders(input, init) {
  return {
    ...isRequest(input) ? headersToObject(input.headers) : {},
    ...headersToObject(init?.headers)
  };
}
function isInternalUrl(url) {
  return !url || url.includes("/_next/") || url.includes("/__nextjs") || url.includes("/__devtools") || url.includes("/next-devtools") || url.includes("_rsc=");
}
function isInternalRequest(url, headers) {
  if (isInternalUrl(url)) return true;
  if (!headers) return false;
  if (!headers["next-action"]) {
    if (headers["rsc"] === "1" || headers["next-router-prefetch"] || headers["next-router-state-tree"]) {
      return true;
    }
  }
  return false;
}
function describeBody(body) {
  if (body == null) return {};
  if (typeof body === "string") return { body };
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return { body: body.toString() };
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const form = [];
    body.forEach((v, k) => form.push([k, typeof v === "string" ? v : `[File ${v.name}]`]));
    return { bodyForm: form };
  }
  return { bodyNote: "[binary body omitted]" };
}
function cloneRequestForBody(input, init, method) {
  if (init?.body != null || !isRequest(input) || method === "GET" || method === "HEAD") return null;
  try {
    return input.clone();
  } catch {
    return null;
  }
}
function safeClone(res) {
  try {
    return res.clone();
  } catch {
    return null;
  }
}
function formatBytes(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  if (n < 1e3) return `${n}B`;
  if (n < 1e3 * 1e3) return `${(n / 1e3).toFixed(1)}kB`;
  return `${(n / 1e3 / 1e3).toFixed(1)}MB`;
}
function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(bin);
}
function isTextual(contentType) {
  return /^(text\/|application\/(json|[\w.+-]*\+json|xml|[\w.+-]*\+xml|javascript|x-www-form-urlencoded|graphql|x-ndjson)|image\/svg)/i.test(
    contentType
  );
}
async function captureResponseBody(res) {
  const contentType = res.headers.get("content-type") || "";
  const len = Number(res.headers.get("content-length"));
  const knownLen = Number.isFinite(len) && res.headers.has("content-length") ? len : void 0;
  if (/text\/event-stream/i.test(contentType)) {
    return { body: "[event stream \xB7 not captured]", contentType, size: knownLen };
  }
  if (!res.body) return { body: null, contentType, size: 0 };
  if (knownLen != null && knownLen > MAX_BODY_BYTES) {
    return { body: `[Body too large to capture \xB7 ${formatBytes(knownLen)}]`, contentType, size: knownLen, truncated: true };
  }
  try {
    if (!contentType || isTextual(contentType) || /x-component/i.test(contentType)) {
      const text = await res.text();
      const truncated = text.length > MAX_BODY_BYTES;
      return {
        body: truncated ? text.slice(0, MAX_BODY_BYTES) : text,
        truncated,
        size: knownLen ?? text.length,
        contentType
      };
    }
    if (knownLen != null && knownLen > MAX_BINARY_BYTES) {
      return { body: `[binary \xB7 ${contentType} \xB7 ${formatBytes(knownLen)}]`, contentType, size: knownLen };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BINARY_BYTES) {
      return { body: `[binary \xB7 ${contentType} \xB7 ${formatBytes(buf.byteLength)}]`, contentType, size: buf.byteLength };
    }
    return { body: bufferToBase64(buf), encoding: "base64", size: buf.byteLength, contentType };
  } catch {
    return { body: "[Unreadable stream]", contentType, size: knownLen };
  }
}
function safeSerialize(value, maxChars = 2e5) {
  try {
    const s = JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`;
      if (typeof FormData !== "undefined" && v instanceof FormData) {
        const o = {};
        v.forEach((x, k) => {
          o[k] = typeof x === "string" ? x : `[File ${x.name}]`;
        });
        return o;
      }
      return v;
    });
    if (s === void 0) return void 0;
    if (s.length > maxChars) return "[Value too large]";
    return JSON.parse(s);
  } catch {
    return "[Unserializable]";
  }
}

// src/server/patch-fetch.ts
var PATCHED = /* @__PURE__ */ Symbol.for("next-devtools.fetch-patched");
var DEVTOOLS_FETCH = /* @__PURE__ */ Symbol.for("next-devtools.fetch-wrapped");
var fetchContext = new import_node_async_hooks.AsyncLocalStorage();
var TRACE_COOKIE_PREFIX = "__ndt_trace_";
function isCacheable(init) {
  const next = init?.next;
  if (next?.tags || next?.revalidate !== void 0 || init?.cache === "force-cache" || init?.cache === "only-if-cached") {
    return { tags: next?.tags ?? [], revalidate: next?.revalidate };
  }
  return null;
}
function isDevToolsActive() {
  return broadcaster.hasListeners() || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true" || process.env.NODE_ENV === "development";
}
var nextHeadersPromise = null;
function getNextHeaders() {
  if (!nextHeadersPromise) {
    nextHeadersPromise = import("next/headers").catch(() => null);
  }
  return nextHeadersPromise;
}
async function writeTraceCookie(entry) {
  try {
    const nextHeaders = await getNextHeaders();
    if (!nextHeaders || typeof nextHeaders.cookies !== "function") return;
    const cookieJar = await Promise.resolve(nextHeaders.cookies());
    if (!cookieJar || typeof cookieJar.set !== "function") return;
    const body = entry.response?.body;
    const truncatedBody = body && body.length > 2e3 ? body.slice(0, 2e3) + "... [truncated for cookie transport]" : body;
    const payload = {
      ...entry,
      response: entry.response ? {
        ...entry.response,
        body: truncatedBody ?? null
      } : void 0
    };
    let serialized = JSON.stringify(payload);
    let encoded = encodeURIComponent(serialized);
    if (encoded.length > 3500) {
      const minimalPayload = {
        id: entry.id,
        category: "network",
        origin: "server",
        state: entry.state,
        error: entry.error,
        request: {
          url: entry.request.url,
          method: entry.request.method,
          headers: {},
          timestamp: entry.request.timestamp
        },
        response: entry.response ? {
          status: entry.response.status,
          statusText: entry.response.statusText,
          headers: {},
          durationMs: entry.response.durationMs,
          ttfbMs: entry.response.ttfbMs,
          downloadMs: entry.response.downloadMs,
          body: "[body omitted: exceeded cookie size limit]"
        } : void 0
      };
      encoded = encodeURIComponent(JSON.stringify(minimalPayload));
    }
    const cookieName = `${TRACE_COOKIE_PREFIX}${entry.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12)}`;
    cookieJar.set(cookieName, encoded, {
      path: "/",
      maxAge: 60,
      httpOnly: false,
      sameSite: "lax"
    });
  } catch {
  }
}
function wrapFetch(original) {
  const wrapped = function devtoolsFetch(...args) {
    if (fetchContext.getStore()) {
      return original.apply(this, args);
    }
    const [input, init] = args;
    if (!isDevToolsActive()) return original.apply(this, args);
    const url = getUrl(input);
    const headers = getRequestHeaders(input, init);
    if (isInternalRequest(url, headers)) return original.apply(this, args);
    const method = getMethod(input, init);
    const startTime = Date.now();
    const t0 = performance.now();
    const id = genId("srv");
    const reqClone = cloneRequestForBody(input, init, method);
    const entry = {
      id,
      category: "network",
      origin: "server",
      state: "pending",
      request: {
        url,
        method,
        headers,
        ...describeBody(init?.body),
        timestamp: startTime
      }
    };
    if (broadcaster.hasListeners()) {
      broadcaster.broadcast(entry);
    }
    const promise = fetchContext.run(true, () => original.apply(this, args));
    trackInFlightFetch(promise);
    promise.then(
      async (response) => {
        const ttfbMs = performance.now() - t0;
        const clone = safeClone(response);
        const tBody = performance.now();
        const [captured, reqBody] = await Promise.all([
          clone ? captureResponseBody(clone) : Promise.resolve(null),
          reqClone ? reqClone.text().catch(() => null) : Promise.resolve(null)
        ]);
        const now = performance.now();
        const request = reqBody != null ? { ...entry.request, body: reqBody } : entry.request;
        const completedEntry = {
          ...entry,
          request,
          state: "completed",
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: headersToObject(response.headers),
            body: captured?.body ?? null,
            bodyEncoding: captured?.encoding,
            bodyTruncated: captured?.truncated,
            contentType: captured?.contentType,
            size: captured?.size,
            durationMs: now - t0,
            ttfbMs,
            downloadMs: now - tBody
          }
        };
        recordSsrTrace(completedEntry);
        if (broadcaster.hasListeners()) {
          broadcaster.broadcast(completedEntry);
        }
        void writeTraceCookie(completedEntry);
        const cache = isCacheable(init);
        if (cache) {
          const header = response.headers.get("x-nextjs-cache");
          const status = header === "HIT" || header === "MISS" || header === "STALE" ? header : ttfbMs < 2 ? "HIT" : "MISS";
          if (broadcaster.hasListeners()) {
            broadcaster.broadcast({
              id: genId("cch"),
              category: "cache",
              key: `${method} ${url}`,
              url,
              tags: cache.tags,
              revalidate: cache.revalidate,
              status,
              timestamp: startTime
            });
          }
        }
      },
      (err) => {
        const failedEntry = {
          ...entry,
          state: "failed",
          error: err?.message || "Network request failed",
          response: {
            status: 0,
            statusText: "FETCH_ERROR",
            headers: {},
            durationMs: performance.now() - t0
          }
        };
        recordSsrTrace(failedEntry);
        if (broadcaster.hasListeners()) {
          broadcaster.broadcast(failedEntry);
        }
        void writeTraceCookie(failedEntry);
      }
    );
    return promise;
  };
  Object.defineProperty(wrapped, DEVTOOLS_FETCH, { value: true });
  return wrapped;
}
function registerNextDevTools() {
  const g3 = globalThis;
  if (g3[PATCHED] || typeof g3.fetch !== "function") return;
  g3[PATCHED] = true;
  let current = g3.fetch;
  const rewrap = (fn) => {
    if (fn[DEVTOOLS_FETCH]) return fn;
    const w = wrapFetch(fn);
    Object.assign(w, fn);
    Object.defineProperty(w, DEVTOOLS_FETCH, { value: true });
    return w;
  };
  let wrapped = rewrap(current);
  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      enumerable: true,
      get: () => wrapped,
      set: (next) => {
        if (next === wrapped || next[DEVTOOLS_FETCH]) return;
        current = next;
        wrapped = rewrap(next);
      }
    });
  } catch {
    g3.fetch = wrapped;
  }
}

// src/server/track-action.ts
var TRACE_COOKIE_PREFIX2 = "__ndt_trace_";
function isDevToolsActive2() {
  return broadcaster.hasListeners() || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true" || process.env.NODE_ENV === "development";
}
var nextHeadersPromise2 = null;
function getNextHeaders2() {
  if (!nextHeadersPromise2) {
    nextHeadersPromise2 = import("next/headers").catch(() => null);
  }
  return nextHeadersPromise2;
}
async function writeActionCookie(entry) {
  try {
    const nextHeaders = await getNextHeaders2();
    if (!nextHeaders || typeof nextHeaders.cookies !== "function") return;
    const cookieJar = await Promise.resolve(nextHeaders.cookies());
    if (!cookieJar || typeof cookieJar.set !== "function") return;
    const payload = { ...entry };
    let encoded = encodeURIComponent(JSON.stringify(payload));
    if (encoded.length > 3500) {
      const minimalPayload = {
        id: entry.id,
        category: "action",
        origin: "server",
        actionName: entry.actionName,
        args: [],
        timestamp: entry.timestamp,
        durationMs: entry.durationMs,
        error: entry.error,
        result: "[result omitted: exceeded cookie size limit]"
      };
      encoded = encodeURIComponent(JSON.stringify(minimalPayload));
    }
    const cookieName = `${TRACE_COOKIE_PREFIX2}${entry.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12)}`;
    cookieJar.set(cookieName, encoded, {
      path: "/",
      maxAge: 60,
      httpOnly: false,
      sameSite: "lax"
    });
  } catch {
  }
}
function trackServerAction(actionName, fn) {
  return async (...args) => {
    if (!isDevToolsActive2()) return fn(...args);
    const t0 = performance.now();
    const timestamp = Date.now();
    const base = {
      id: genId("act"),
      category: "action",
      origin: "server",
      actionName,
      args: safeSerialize(args) ?? [],
      timestamp
    };
    try {
      const result = await fn(...args);
      const entry = {
        ...base,
        result: safeSerialize(result),
        durationMs: performance.now() - t0
      };
      if (broadcaster.hasListeners()) {
        broadcaster.broadcast(entry);
      }
      void writeActionCookie(entry);
      return result;
    } catch (err) {
      const e = err;
      const entry = {
        ...base,
        error: e?.message || String(err),
        errorStack: e?.stack,
        durationMs: performance.now() - t0
      };
      if (broadcaster.hasListeners()) {
        broadcaster.broadcast(entry);
      }
      void writeActionCookie(entry);
      throw err;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  clearSsrTraces,
  getRecentSsrTraces,
  recordSsrTrace,
  registerNextDevTools,
  trackServerAction,
  waitForSsrTraces
});
//# sourceMappingURL=server.js.map