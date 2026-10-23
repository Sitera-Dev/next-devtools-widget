'use client';

// src/client/ssr-drainer.ts
var SSR_SCRIPT_ID = "__next_devtools_ssr__";
function drainSsrTraces(emit) {
  if (typeof document === "undefined") return;
  const elements = [];
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll(`#${SSR_SCRIPT_ID}, [data-next-devtools-ssr]`).forEach((el) => elements.push(el));
  } else if (typeof document.getElementById === "function") {
    const el = document.getElementById(SSR_SCRIPT_ID);
    if (el) elements.push(el);
  }
  if (elements.length === 0) return;
  elements.forEach((el) => {
    try {
      const content = el.textContent;
      if (content) {
        const traces = JSON.parse(content);
        if (Array.isArray(traces)) {
          for (const entry of traces) {
            if (entry && typeof entry === "object" && entry.id && entry.category) {
              emit(entry);
            }
          }
        }
      }
    } catch {
    } finally {
      el.remove();
    }
  });
}
function setupSsrObserver(emit) {
  if (typeof document === "undefined") {
    return () => {
    };
  }
  drainSsrTraces(emit);
  if (typeof MutationObserver === "undefined") {
    return () => {
    };
  }
  const hasScript = () => {
    if (typeof document.querySelector === "function") {
      return !!document.querySelector(`#${SSR_SCRIPT_ID}, [data-next-devtools-ssr]`);
    }
    if (typeof document.getElementById === "function") {
      return !!document.getElementById(SSR_SCRIPT_ID);
    }
    return false;
  };
  const observer = new MutationObserver(() => {
    if (hasScript()) {
      drainSsrTraces(emit);
    }
  });
  try {
    const target = document.documentElement || document.body;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }
  } catch {
  }
  return () => {
    observer.disconnect();
  };
}

// src/client/dev-tools.tsx
import { useCallback as useCallback3, useEffect as useEffect5, useLayoutEffect as useLayoutEffect2, useMemo as useMemo4, useRef as useRef9, useState as useState11 } from "react";

// src/shared/utils.ts
var MAX_BODY_BYTES = 10 * 1024 * 1024;
var MAX_BINARY_BYTES = 2 * 1024 * 1024;
var DEFAULT_REDACT = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  /token|secret|password/i
];
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
function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "\u2014";
  return ms < 1e3 ? `${Math.round(ms)}ms` : `${(ms / 1e3).toFixed(2)}s`;
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
function isSensitive(name, rules) {
  const n = name.toLowerCase();
  return rules.some((r) => {
    if (typeof r === "string") return n === r.toLowerCase();
    r.lastIndex = 0;
    return r.test(name);
  });
}
function redactValue(value, rules, mask = "<REDACTED>", key) {
  if (key !== void 0 && isSensitive(key, rules) && (value === null || typeof value !== "object")) return mask;
  if (Array.isArray(value)) return value.map((x) => redactValue(x, rules, mask));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, redactValue(x, rules, mask, k)]));
  }
  return value;
}
function redactJsonText(text, rules, mask = "<REDACTED>") {
  try {
    return JSON.stringify(redactValue(JSON.parse(text), rules, mask));
  } catch {
    return text;
  }
}

// src/client/components/copy-actions.tsx
import { createContext as createContext2, useCallback as useCallback2, useContext as useContext2, useRef as useRef2, useState as useState2 } from "react";

// src/client/components/curl-generator.ts
var SKIP_HEADERS = /^(host|content-length|connection|accept-encoding|origin|referer|sec-.*)$/i;
var REDACTED = "<REDACTED>";
function resolveUrl(url, origin) {
  const base = origin ?? (typeof location !== "undefined" ? location.origin : void 0);
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
function prepare(req, opts) {
  const headers = [];
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (SKIP_HEADERS.test(key)) continue;
    if (key === "cookie" && !opts.includeCookie) continue;
    headers.push([key, opts.redact && isSensitive(key, opts.redact) ? REDACTED : v]);
  }
  let body = req.body ?? null;
  if (body && opts.redact) body = redactJsonText(body, opts.redact);
  return { url: resolveUrl(req.url, opts.origin), headers, body };
}
function bashQuote(s) {
  if (/[\x00-\x08\x0a-\x1f\x7f]/.test(s)) {
    const esc = s.replace(/[\\'\x00-\x1f\x7f]/g, (c) => {
      if (c === "\\") return "\\\\";
      if (c === "'") return "\\'";
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "	") return "\\t";
      return `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
    return `$'${esc}'`;
  }
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function cmdQuote(s) {
  const esc = s.replace(/"/g, '\\"').replace(/%/g, '"^%"').replace(/\r?\n/g, '"^\n\n"');
  return `"${esc}"`;
}
function psQuote(s) {
  return `'${s.replace(/['\u2018\u2019\u201a\u201b]/g, (c) => c + c)}'`;
}
function buildCurl(req, flavor = "bash", opts = {}) {
  const { url, headers, body } = prepare(req, opts);
  const method = req.method.toUpperCase();
  const form = req.bodyForm;
  const lines = [];
  const comment = req.bodyNote ? req.bodyNote.replace(/^\[|\]$/g, "") : "";
  if (flavor === "powershell") {
    const parts = [`Invoke-WebRequest -UseBasicParsing -Uri ${psQuote(url)}`];
    if (method !== "GET") parts.push(`-Method ${psQuote(method)}`);
    const ct = headers.find(([k]) => k === "content-type");
    const rest = headers.filter(([k]) => k !== "content-type");
    if (rest.length) {
      parts.push(`-Headers @{
${rest.map(([k, v]) => `  ${psQuote(k)}=${psQuote(v)}`).join("\n")}
}`);
    }
    if (ct && !form) parts.push(`-ContentType ${psQuote(ct[1])}`);
    if (form) parts.push(`-Form @{
${form.map(([k, v]) => `  ${psQuote(k)}=${psQuote(v)}`).join("\n")}
}`);
    else if (body != null) parts.push(`-Body ${psQuote(body)}`);
    const out2 = parts.join(" `\n");
    return comment ? `# ${comment}
${out2}` : out2;
  }
  const q = flavor === "cmd" ? cmdQuote : bashQuote;
  const cont = flavor === "cmd" ? " ^" : " \\";
  lines.push(`curl ${q(url)}`);
  if (method === "HEAD") lines.push("-I");
  else if (method !== "GET") lines.push(`-X ${method}`);
  for (const [k, v] of headers) {
    if (form && k === "content-type") continue;
    lines.push(`-H ${q(`${k}: ${v}`)}`);
  }
  if (form) for (const [k, v] of form) lines.push(`-F ${q(`${k}=${v}`)}`);
  else if (body != null) lines.push(`--data-raw ${q(body)}`);
  lines.push("--compressed");
  const out = lines.map((l, i) => i === 0 ? l : `  ${l}`).join(`${cont}
`);
  if (!comment) return out;
  return `${flavor === "cmd" ? "REM" : "#"} ${comment}
${out}`;
}
function buildFetchSnippet(req, opts = {}) {
  const { url, headers, body } = prepare(req, opts);
  const init = { method: req.method.toUpperCase() };
  if (headers.length) init.headers = Object.fromEntries(headers);
  if (body != null) init.body = body;
  return `fetch(${JSON.stringify(url)}, ${JSON.stringify(init, null, 2)});`;
}
function buildHarEntry(entry, opts = {}) {
  const { request: req, response: res } = entry;
  const { url, headers, body } = prepare(req, { ...opts, includeCookie: true });
  let queryString = [];
  try {
    queryString = [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
  }
  const mimeType = headers.find(([k]) => k === "content-type")?.[1] ?? "";
  const wait = res?.ttfbMs ?? 0;
  const receive = res?.downloadMs ?? 0;
  return {
    startedDateTime: new Date(req.timestamp).toISOString(),
    time: res?.durationMs ?? 0,
    request: {
      method: req.method,
      url,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: headers.map(([name, value]) => ({ name, value })),
      queryString,
      headersSize: -1,
      bodySize: body ? body.length : 0,
      ...body != null ? { postData: { mimeType, text: body } } : {}
    },
    response: {
      status: res?.status ?? 0,
      statusText: res?.statusText ?? "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: Object.entries(res?.headers ?? {}).map(([name, value]) => ({ name, value })),
      content: {
        size: res?.size ?? 0,
        mimeType: res?.contentType ?? "",
        ...res?.body != null ? { text: res.body, ...res.bodyEncoding === "base64" ? { encoding: "base64" } : {} } : {}
      },
      redirectURL: res?.headers.location ?? "",
      headersSize: -1,
      bodySize: res?.size ?? -1
    },
    cache: {},
    timings: { send: 0, wait, receive }
  };
}

// src/client/components/ui.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var RedactContext = createContext(DEFAULT_REDACT);
var useRedact = () => useContext(RedactContext);
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
function downloadText(filename, content, mime = "text/plain", base64 = false) {
  let blob;
  if (base64) {
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = new Blob([content], { type: mime });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
    }
  }, [key]);
  const set = useCallback(
    (v) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
      }
    },
    [key]
  );
  return [value, set];
}
function useFlash(ms = 1500) {
  const [on, setOn] = useState(false);
  const t = useRef(void 0);
  useEffect(() => () => clearTimeout(t.current), []);
  return [
    on,
    () => {
      setOn(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setOn(false), ms);
    }
  ];
}
var I = (d, size = 14) => /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: d });
var IconLogo = ({ size = 16, className }) => /* @__PURE__ */ jsxs(
  "svg",
  {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: `ndt-logo ${className ?? ""}`,
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx("path", { stroke: "none", d: "M0 0h24v24H0z", fill: "none" }),
      /* @__PURE__ */ jsx("path", { d: "M9 9v-1a3 3 0 0 1 6 0v1" }),
      /* @__PURE__ */ jsx("path", { d: "M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1 -10 0v-3a6 6 0 0 1 1 -3" }),
      /* @__PURE__ */ jsx("path", { d: "M3 13l4 0" }),
      /* @__PURE__ */ jsx("path", { d: "M17 13l4 0" }),
      /* @__PURE__ */ jsx("path", { d: "M12 20l0 -6" }),
      /* @__PURE__ */ jsx("path", { d: "M4 19l3.35 -2" }),
      /* @__PURE__ */ jsx("path", { d: "M20 19l-3.35 -2" }),
      /* @__PURE__ */ jsx("path", { d: "M4 7l3.75 2.4" }),
      /* @__PURE__ */ jsx("path", { d: "M20 7l-3.75 2.4" })
    ]
  }
);
var IconSearch = () => I(/* @__PURE__ */ jsxs(Fragment, { children: [
  /* @__PURE__ */ jsx("circle", { cx: "11", cy: "11", r: "7" }),
  /* @__PURE__ */ jsx("path", { d: "m20 20-3.5-3.5" })
] }));
var IconX = () => I(/* @__PURE__ */ jsx("path", { d: "M18 6 6 18M6 6l12 12" }));
var IconMaximize = () => I(/* @__PURE__ */ jsx("path", { d: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" }));
var IconMinimize = () => I(/* @__PURE__ */ jsx("path", { d: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" }));
var IconTrash = () => I(/* @__PURE__ */ jsx("path", { d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" }));
var IconCopy = () => I(/* @__PURE__ */ jsxs(Fragment, { children: [
  /* @__PURE__ */ jsx("rect", { x: "9", y: "9", width: "12", height: "12", rx: "2" }),
  /* @__PURE__ */ jsx("path", { d: "M5 15V5a2 2 0 0 1 2-2h8" })
] }));
var IconCheck = () => I(/* @__PURE__ */ jsx("path", { d: "m5 12 5 5L20 7" }));
var IconChevronRight = () => I(/* @__PURE__ */ jsx("path", { d: "m9 6 6 6-6 6" }), 12);
var IconChevronDown = () => I(/* @__PURE__ */ jsx("path", { d: "m6 9 6 6 6-6" }), 12);
var IconArrowLeft = () => I(/* @__PURE__ */ jsx("path", { d: "M19 12H5M12 19l-7-7 7-7" }));
var IconDownload = () => I(/* @__PURE__ */ jsx("path", { d: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16" }));
var IconWrap = () => I(/* @__PURE__ */ jsx("path", { d: "M3 6h18M3 12h14a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M3 18h6" }));
var IconExpand = () => I(/* @__PURE__ */ jsx("path", { d: "M7 8l5-5 5 5M7 16l5 5 5-5" }));
function IconButton(props) {
  const { label, children, className, ...rest } = props;
  return /* @__PURE__ */ jsx("button", { type: "button", className: `ndt-icon-btn ${className ?? ""}`, "aria-label": label, title: label, ...rest, children });
}
function CopyButton({ getText, label = "Copy", className }) {
  const [done2, flash] = useFlash();
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      className: `ndt-btn ${className ?? ""}`,
      onClick: async () => {
        if (await copyText(getText())) flash();
      },
      children: [
        done2 ? /* @__PURE__ */ jsx(IconCheck, {}) : /* @__PURE__ */ jsx(IconCopy, {}),
        /* @__PURE__ */ jsx("span", { "aria-live": "polite", children: done2 ? "Copied \u2713" : label })
      ]
    }
  );
}
function MaskedValue({ name, value }) {
  const rules = useRedact();
  const [shown, setShown] = useState(false);
  if (!isSensitive(name, rules)) return /* @__PURE__ */ jsx(Fragment, { children: value });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    shown ? value : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    " ",
    /* @__PURE__ */ jsx("button", { type: "button", className: "ndt-link", onClick: () => setShown((s) => !s), children: shown ? "Hide" : "Reveal" })
  ] });
}
function Accordion({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return /* @__PURE__ */ jsxs("section", { className: "ndt-acc", children: [
    /* @__PURE__ */ jsxs("button", { type: "button", className: "ndt-acc-head", "aria-expanded": open, onClick: () => setOpen(!open), children: [
      open ? /* @__PURE__ */ jsx(IconChevronDown, {}) : /* @__PURE__ */ jsx(IconChevronRight, {}),
      /* @__PURE__ */ jsx("span", { children: title }),
      count != null && /* @__PURE__ */ jsxs("span", { className: "ndt-muted", children: [
        "(",
        count,
        ")"
      ] })
    ] }),
    open && /* @__PURE__ */ jsx("div", { className: "ndt-acc-body", children })
  ] });
}
function KV({ rows }) {
  return /* @__PURE__ */ jsx("dl", { className: "ndt-kv", children: rows.map(([k, v], i) => /* @__PURE__ */ jsxs(React.Fragment, { children: [
    /* @__PURE__ */ jsx("dt", { children: k }),
    /* @__PURE__ */ jsx("dd", { children: v })
  ] }, i)) });
}
function statusTone(status, state) {
  if (state === "pending") return "muted";
  if (state === "failed" || !status) return "destructive";
  if (status >= 500) return "destructive";
  if (status >= 400) return "warning";
  if (status >= 300) return "info";
  return "success";
}
function methodTone(method) {
  switch (method) {
    case "GET":
      return "info";
    case "POST":
      return "success";
    case "PUT":
    case "PATCH":
      return "warning";
    case "DELETE":
      return "destructive";
    default:
      return "muted";
  }
}
function highlight(text, query) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out = [];
  let i = 0;
  let n = 0;
  for (; ; ) {
    const at = lower.indexOf(q, i);
    if (at < 0) break;
    if (at > i) out.push(text.slice(i, at));
    out.push(/* @__PURE__ */ jsx("mark", { children: text.slice(at, at + q.length) }, n++));
    i = at + q.length;
  }
  if (!out.length) return text;
  if (i < text.length) out.push(text.slice(i));
  return out;
}

// src/client/components/copy-actions.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var COPY_LABELS = {
  curl: "Copy cURL",
  "curl-cmd": "Copy cURL (cmd)",
  "curl-ps": "Copy cURL (PowerShell)",
  fetch: "Copy as fetch",
  har: "Copy as HAR entry",
  "curl-redacted": "Copy cURL (redacted)"
};
var Ctx = createContext2(null);
var useCopy = () => {
  const c = useContext2(Ctx);
  if (!c) throw new Error("useCopy must be used inside <CopyProvider>");
  return c;
};
function CopyProvider({ children }) {
  const rules = useRedact();
  const [includeCookie, setIncludeCookie] = useLocalStorage("next-devtools:include-cookie", false);
  const [hintDismissed, setHintDismissed] = useLocalStorage("next-devtools:hint-dismissed", false);
  const [toast, setToast] = useState2(null);
  const timer = useRef2(void 0);
  const command = useCallback2(
    (entry, kind) => {
      const opts = { includeCookie, redact: kind === "curl-redacted" ? rules : null };
      switch (kind) {
        case "curl-cmd":
          return buildCurl(entry.request, "cmd", opts);
        case "curl-ps":
          return buildCurl(entry.request, "powershell", opts);
        case "fetch":
          return buildFetchSnippet(entry.request, opts);
        case "har":
          return JSON.stringify(buildHarEntry(entry, opts), null, 2);
        default:
          return buildCurl(entry.request, "bash", opts);
      }
    },
    [includeCookie, rules]
  );
  const copy = useCallback2(
    async (entry, kind) => {
      const ok = await copyText(command(entry, kind));
      if (!ok) return false;
      const hasSecrets = kind !== "curl-redacted" && Object.keys(entry.request.headers).some((h) => isSensitive(h, rules));
      setToast({ msg: `${COPY_LABELS[kind].replace("Copy ", "Copied ")} \u2713`, hint: hasSecrets && !hintDismissed });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 3500);
      return true;
    },
    [command, rules, hintDismissed]
  );
  return /* @__PURE__ */ jsxs2(Ctx.Provider, { value: { copy, command, includeCookie, setIncludeCookie }, children: [
    children,
    /* @__PURE__ */ jsx2("div", { className: "ndt-toast", role: "status", "aria-live": "polite", children: toast && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      /* @__PURE__ */ jsx2("span", { children: toast.msg }),
      toast.hint && /* @__PURE__ */ jsxs2("span", { className: "ndt-muted", children: [
        " ",
        "Copied with real credentials. Be careful when sharing.",
        " ",
        /* @__PURE__ */ jsx2("button", { type: "button", className: "ndt-link", onClick: () => {
          setHintDismissed(true);
          setToast(null);
        }, children: "Dismiss" })
      ] })
    ] }) })
  ] });
}

// src/client/components/drawer.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var LABELS = { network: "Network", actions: "Actions", cache: "Cache", system: "System" };
var GRIP = {
  "bottom-right": "grip-tl",
  "bottom-left": "grip-tr",
  "top-right": "grip-bl",
  "top-left": "grip-br"
};
function Drawer(p) {
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      ref: p.innerRef,
      className: "ndt-panel",
      style: p.style,
      role: "dialog",
      "aria-label": "Next DevTools",
      tabIndex: -1,
      onKeyDown: (e) => {
        if (e.key === "Escape") p.onClose();
      },
      children: [
        !p.maximized && /* @__PURE__ */ jsx3(
          "div",
          {
            className: `ndt-grip ${GRIP[p.corner]}`,
            "aria-hidden": "true",
            onPointerDown: p.onResizeStart,
            onPointerMove: p.onResizeMove,
            onPointerUp: p.onResizeEnd,
            onPointerCancel: p.onResizeEnd
          }
        ),
        /* @__PURE__ */ jsxs3("div", { className: "ndt-header", children: [
          /* @__PURE__ */ jsx3("div", { className: "ndt-brand", title: "Next DevTools", children: /* @__PURE__ */ jsx3(IconLogo, { size: 16 }) }),
          /* @__PURE__ */ jsx3("div", { className: "ndt-tabs", role: "tablist", "aria-label": "DevTools sections", children: p.tabs.map((t) => /* @__PURE__ */ jsx3("button", { type: "button", role: "tab", "aria-selected": p.active === t, onClick: () => p.onTab(t), children: LABELS[t] }, t)) }),
          /* @__PURE__ */ jsxs3("div", { className: "ndt-header-actions", children: [
            /* @__PURE__ */ jsx3(IconButton, { label: p.maximized ? "Restore size" : "Maximize", onClick: p.onToggleMaximize, children: p.maximized ? /* @__PURE__ */ jsx3(IconMinimize, {}) : /* @__PURE__ */ jsx3(IconMaximize, {}) }),
            /* @__PURE__ */ jsx3(IconButton, { label: "Close", onClick: p.onClose, children: /* @__PURE__ */ jsx3(IconX, {}) })
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "ndt-main", role: "tabpanel", children: p.children })
      ]
    }
  );
}

// src/client/components/tabs/actions-tab.tsx
import { useRef as useRef4, useState as useState5 } from "react";

// src/client/components/json-tree.tsx
import { useMemo, useState as useState3 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MAX_STR = 160;
var PAGE = 50;
var isContainer = (v) => v !== null && typeof v === "object";
function findMatches(root, query) {
  const set = /* @__PURE__ */ new Set();
  if (!query) return set;
  const q = query.toLowerCase();
  const walk = (v) => {
    if (!isContainer(v)) return String(v).toLowerCase().includes(q);
    let any = false;
    for (const [k, child] of Object.entries(v)) {
      const keyHit = !Array.isArray(v) && k.toLowerCase().includes(q);
      const childHit = walk(child);
      any = any || keyHit || childHit;
    }
    if (any) set.add(v);
    return any;
  };
  walk(root);
  return set;
}
function jsonPath(parent, key, isArrayItem) {
  if (isArrayItem) return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/'/g, "\\'")}']`;
}
function Primitive({ name, value, path, ctx }) {
  const [full, setFull] = useState3(false);
  const [copied, flash] = useFlash(1200);
  const isStr = typeof value === "string";
  const str = isStr ? value : String(value);
  const cls = isStr ? "jt-str" : typeof value === "number" ? "jt-num" : "jt-lit";
  const sensitive = name !== void 0 && isSensitive(name, ctx.rules);
  const long = isStr && str.length > MAX_STR;
  const shown = long && !full ? `${str.slice(0, MAX_STR)}\u2026` : str;
  const copy = async (text) => {
    if (await copyText(text)) flash();
  };
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: "jt-line",
      onContextMenu: (e) => {
        e.preventDefault();
        void copy(path);
      },
      title: "Click value to copy \xB7 right-click to copy JSONPath",
      children: [
        name !== void 0 && /* @__PURE__ */ jsx4("span", { className: "jt-key", children: highlight(name, ctx.query) }),
        name !== void 0 && /* @__PURE__ */ jsx4("span", { className: "jt-punc", children: ": " }),
        /* @__PURE__ */ jsx4("span", { className: cls, children: sensitive ? /* @__PURE__ */ jsx4(MaskedValue, { name, value: isStr ? `"${str}"` : str }) : /* @__PURE__ */ jsxs4("span", { className: "jt-val", onClick: () => copy(str), children: [
          isStr ? '"' : "",
          highlight(shown, ctx.query),
          isStr ? '"' : ""
        ] }) }),
        long && /* @__PURE__ */ jsx4("button", { type: "button", className: "ndt-link", onClick: () => setFull(!full), children: full ? "Show less" : `Show more (${str.length} chars)` }),
        /* @__PURE__ */ jsx4("button", { type: "button", className: "jt-copy", "aria-label": "Copy value", onClick: () => copy(str), children: copied ? "\u2713" : /* @__PURE__ */ jsx4(IconCopy, {}) })
      ]
    }
  );
}
function Node({ name, value, path, depth, ctx, isArrayItem }) {
  const [open, setOpen] = useState3(depth < ctx.level);
  const [limit, setLimit] = useState3(PAGE);
  if (!isContainer(value)) return /* @__PURE__ */ jsx4(Primitive, { name, value, path, ctx });
  const isArr = Array.isArray(value);
  const entries = Object.entries(value);
  const forced = ctx.matches.has(value);
  const isOpen = forced || open;
  const preview = entries.length === 0 ? isArr ? "[]" : "{}" : isArr ? `[ ${entries.length} items ]` : `{ ${entries.length} keys }`;
  return /* @__PURE__ */ jsxs4("div", { className: "jt-node", children: [
    /* @__PURE__ */ jsxs4("div", { className: "jt-line", onContextMenu: (e) => {
      e.preventDefault();
      void copyText(path);
    }, children: [
      /* @__PURE__ */ jsx4("button", { type: "button", className: "jt-toggle", "aria-expanded": isOpen, "aria-label": isOpen ? "Collapse" : "Expand", onClick: () => setOpen(!open), children: isOpen ? "\u25BE" : "\u25B8" }),
      name !== void 0 && /* @__PURE__ */ jsx4("span", { className: "jt-key", children: highlight(name, ctx.query) }),
      name !== void 0 && /* @__PURE__ */ jsx4("span", { className: "jt-punc", children: ": " }),
      !isOpen && /* @__PURE__ */ jsx4("span", { className: "jt-preview", onClick: () => setOpen(true), children: preview }),
      isOpen && /* @__PURE__ */ jsx4("span", { className: "jt-punc", children: isArr ? "[" : "{" })
    ] }),
    isOpen && /* @__PURE__ */ jsxs4("div", { className: "jt-children", children: [
      entries.slice(0, limit).map(([k, v]) => /* @__PURE__ */ jsx4(Node, { name: isArr ? void 0 : k, value: v, path: jsonPath(path, k, isArr), depth: depth + 1, ctx, isArrayItem: isArr }, k)),
      entries.length > limit && /* @__PURE__ */ jsxs4("button", { type: "button", className: "ndt-link", onClick: () => setLimit(limit + PAGE), children: [
        "Show next ",
        Math.min(PAGE, entries.length - limit),
        " (",
        entries.length - limit,
        " remaining)"
      ] }),
      /* @__PURE__ */ jsx4("span", { className: "jt-punc", children: isArr ? "]" : "}" })
    ] })
  ] });
}
function JsonTree({ value, query, level, epoch, rules }) {
  const matches = useMemo(() => findMatches(value, query), [value, query]);
  const ctx = { query, level, matches, rules };
  return /* @__PURE__ */ jsx4("div", { className: "jt", children: /* @__PURE__ */ jsx4(Node, { value, path: "$", depth: 0, ctx }) }, epoch);
}

// src/client/components/virtual-list.tsx
import { useEffect as useEffect2, useLayoutEffect, useRef as useRef3, useState as useState4 } from "react";
import { jsx as jsx5 } from "react/jsx-runtime";
function VirtualList({ items, rowHeight, renderRow, selectedIndex, scrollMemory, empty }) {
  const ref = useRef3(null);
  const [scrollTop, setScrollTop] = useState4(0);
  const [height, setHeight] = useState4(300);
  const isEmpty = items.length === 0;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (scrollMemory) el.scrollTop = scrollMemory.current;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollMemory, isEmpty]);
  useEffect2(() => {
    const el = ref.current;
    if (!el || selectedIndex == null || selectedIndex < 0) return;
    const top = selectedIndex * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
  }, [selectedIndex, rowHeight]);
  if (!items.length) return /* @__PURE__ */ jsx5("div", { className: "ndt-empty", children: empty });
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + 6);
  return /* @__PURE__ */ jsx5(
    "div",
    {
      ref,
      className: "ndt-vlist",
      role: "listbox",
      onScroll: (e) => {
        const t = e.currentTarget.scrollTop;
        if (scrollMemory) scrollMemory.current = t;
        setScrollTop(t);
      },
      children: /* @__PURE__ */ jsx5("div", { style: { height: items.length * rowHeight, position: "relative" }, children: items.slice(start, end).map((item, i) => /* @__PURE__ */ jsx5("div", { className: "ndt-vrow", style: { top: (start + i) * rowHeight, height: rowHeight }, children: renderRow(item, start + i) }, start + i)) })
    }
  );
}

// src/client/components/tabs/actions-tab.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function ValueView({ value }) {
  const rules = useRedact();
  if (value !== null && typeof value === "object") {
    return /* @__PURE__ */ jsx6(JsonTree, { value, query: "", level: 2, epoch: 0, rules });
  }
  if (value === void 0) return /* @__PURE__ */ jsx6("div", { className: "ndt-muted", children: "undefined" });
  return /* @__PURE__ */ jsx6("pre", { className: "ndt-code", children: typeof value === "string" ? value : JSON.stringify(value) });
}
function ActionsTab({ entries, onClear }) {
  const [selectedId, setSelectedId] = useState5(null);
  const scrollMemory = useRef4(0);
  const actions = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    if (e.category === "action") actions.push(e);
  }
  const selected = actions.find((a) => a.id === selectedId);
  if (selected) {
    return /* @__PURE__ */ jsx6("div", { className: "ndt-tab", tabIndex: -1, onKeyDown: (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSelectedId(null);
      }
    }, children: /* @__PURE__ */ jsxs5("div", { className: "ndt-detail", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ndt-detail-head", children: [
        /* @__PURE__ */ jsxs5("button", { type: "button", className: "ndt-btn", onClick: () => setSelectedId(null), children: [
          /* @__PURE__ */ jsx6(IconArrowLeft, {}),
          " Back"
        ] }),
        /* @__PURE__ */ jsx6("span", { className: "ndt-detail-title", children: selected.actionName })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ndt-summary", children: [
        selected.error ? "\u2717 Failed" : "\u2713 OK",
        " \xB7 ",
        formatDuration(selected.durationMs),
        " \xB7 ",
        selected.origin === "client" ? "Client" : "Server",
        " \xB7",
        " ",
        new Date(selected.timestamp).toLocaleTimeString()
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ndt-detail-body", children: [
        /* @__PURE__ */ jsx6(Accordion, { title: "Arguments", count: selected.args.length, defaultOpen: true, children: /* @__PURE__ */ jsx6(ValueView, { value: selected.args }) }),
        selected.error ? /* @__PURE__ */ jsx6(Accordion, { title: "Error", defaultOpen: true, children: /* @__PURE__ */ jsx6("pre", { className: "ndt-code tone-destructive-text", children: selected.error }) }) : /* @__PURE__ */ jsx6(Accordion, { title: "Result", defaultOpen: true, children: /* @__PURE__ */ jsx6(ValueView, { value: selected.result }) }),
        selected.errorStack && /* @__PURE__ */ jsx6(Accordion, { title: "Stack trace", children: /* @__PURE__ */ jsx6("pre", { className: "ndt-code", children: selected.errorStack }) })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs5("div", { className: "ndt-tab", tabIndex: -1, children: [
    /* @__PURE__ */ jsxs5("div", { className: "ndt-toolbar", children: [
      /* @__PURE__ */ jsxs5("span", { className: "ndt-muted", children: [
        actions.length,
        " invocation",
        actions.length === 1 ? "" : "s"
      ] }),
      /* @__PURE__ */ jsx6("span", { className: "ndt-spacer" }),
      /* @__PURE__ */ jsx6("button", { type: "button", className: "ndt-icon-btn", "aria-label": "Clear all", title: "Clear all", onClick: onClear, children: /* @__PURE__ */ jsx6(IconTrash, {}) })
    ] }),
    /* @__PURE__ */ jsx6(
      VirtualList,
      {
        items: actions,
        rowHeight: 28,
        scrollMemory,
        empty: "No Server Actions yet. Invocations will appear here.",
        renderRow: (a) => /* @__PURE__ */ jsxs5("div", { role: "option", "aria-selected": false, className: "ndt-row ndt-row-simple", onClick: () => setSelectedId(a.id), children: [
          /* @__PURE__ */ jsx6("span", { className: "ndt-row-path ndt-mono", title: a.actionName, children: a.actionName }),
          /* @__PURE__ */ jsx6("span", { className: "ndt-row-num ndt-tnum", children: formatDuration(a.durationMs) }),
          /* @__PURE__ */ jsx6("span", { className: `ndt-status ${a.error ? "tone-destructive" : "tone-success"}`, children: a.error ? "\u2717 ERR" : "\u2713 OK" })
        ] })
      }
    )
  ] });
}

// src/client/components/tabs/cache-tab.tsx
import { useRef as useRef5, useState as useState6 } from "react";
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var tone = (s) => s === "HIT" ? "success" : s === "MISS" ? "warning" : s === "STALE" ? "info" : "muted";
function CacheTab({ entries, onClear }) {
  const [selectedId, setSelectedId] = useState6(null);
  const scrollMemory = useRef5(0);
  const items = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    if (e.category === "cache") items.push(e);
  }
  const selected = items.find((c) => c.id === selectedId);
  if (selected) {
    const timeline = items.filter((c) => c.key === selected.key).sort((a, b) => a.timestamp - b.timestamp);
    return /* @__PURE__ */ jsx7("div", { className: "ndt-tab", tabIndex: -1, onKeyDown: (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSelectedId(null);
      }
    }, children: /* @__PURE__ */ jsxs6("div", { className: "ndt-detail", children: [
      /* @__PURE__ */ jsxs6("div", { className: "ndt-detail-head", children: [
        /* @__PURE__ */ jsxs6("button", { type: "button", className: "ndt-btn", onClick: () => setSelectedId(null), children: [
          /* @__PURE__ */ jsx7(IconArrowLeft, {}),
          " Back"
        ] }),
        /* @__PURE__ */ jsx7("span", { className: "ndt-detail-title", title: selected.key, children: selected.key })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "ndt-summary", children: [
        /* @__PURE__ */ jsx7("span", { className: `ndt-status tone-${tone(selected.status)}`, children: selected.status }),
        selected.revalidate !== void 0 && /* @__PURE__ */ jsxs6(Fragment3, { children: [
          " \xB7 revalidate: ",
          String(selected.revalidate)
        ] })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "ndt-detail-body", children: [
        /* @__PURE__ */ jsx7("h4", { className: "ndt-h", children: "Tags" }),
        /* @__PURE__ */ jsx7("div", { className: "ndt-chips", children: selected.tags.length ? selected.tags.map((t) => /* @__PURE__ */ jsx7("span", { className: "ndt-chip", children: t }, t)) : /* @__PURE__ */ jsx7("span", { className: "ndt-muted", children: "No tags" }) }),
        /* @__PURE__ */ jsxs6("h4", { className: "ndt-h", children: [
          "Timeline (",
          timeline.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx7("ul", { className: "ndt-timeline", children: timeline.map((c) => /* @__PURE__ */ jsxs6("li", { children: [
          /* @__PURE__ */ jsx7("span", { className: "ndt-tnum ndt-muted", children: new Date(c.timestamp).toLocaleTimeString() }),
          /* @__PURE__ */ jsx7("span", { className: `ndt-status tone-${tone(c.status)}`, children: c.status })
        ] }, c.id)) })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs6("div", { className: "ndt-tab", tabIndex: -1, children: [
    /* @__PURE__ */ jsxs6("div", { className: "ndt-toolbar", children: [
      /* @__PURE__ */ jsxs6("span", { className: "ndt-muted", children: [
        items.length,
        " cache event",
        items.length === 1 ? "" : "s"
      ] }),
      /* @__PURE__ */ jsx7("span", { className: "ndt-spacer" }),
      /* @__PURE__ */ jsx7("button", { type: "button", className: "ndt-icon-btn", "aria-label": "Clear all", title: "Clear all", onClick: onClear, children: /* @__PURE__ */ jsx7(IconTrash, {}) })
    ] }),
    /* @__PURE__ */ jsx7(
      VirtualList,
      {
        items,
        rowHeight: 28,
        scrollMemory,
        empty: "No cache activity yet. fetch() calls with next.tags / revalidate appear here.",
        renderRow: (c) => /* @__PURE__ */ jsxs6("div", { role: "option", "aria-selected": false, className: "ndt-row ndt-row-simple", onClick: () => setSelectedId(c.id), children: [
          /* @__PURE__ */ jsx7("span", { className: "ndt-row-path ndt-mono", title: c.key, children: c.key }),
          /* @__PURE__ */ jsx7("span", { className: `ndt-status tone-${tone(c.status)}`, children: c.status })
        ] })
      }
    )
  ] });
}

// src/client/components/tabs/network-tab.tsx
import { useMemo as useMemo3, useRef as useRef7, useState as useState9 } from "react";

// src/client/components/detail-view.tsx
import React8, { useState as useState8 } from "react";

// src/client/components/body-viewer.tsx
import { useEffect as useEffect3, useMemo as useMemo2, useRef as useRef6, useState as useState7 } from "react";
import { Fragment as Fragment4, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var LARGE = 256 * 1024;
var HUGE = 2 * 1024 * 1024;
var CHUNK = 256 * 1024;
var PLACEHOLDER = /^\[(binary|event stream|Body too large|Unreadable stream)/;
function extFor(ct, json) {
  if (json || /json/i.test(ct)) return "json";
  if (/html/i.test(ct)) return "html";
  if (/xml/i.test(ct)) return "xml";
  if (/^image\/([\w+-]+)/i.test(ct)) return RegExp.$1.replace("svg+xml", "svg");
  if (/^text\//i.test(ct)) return "txt";
  return "bin";
}
function BodyViewer({ body, encoding, contentType = "", size, truncated, filename }) {
  const rules = useRedact();
  const [mode, setMode] = useState7(null);
  const [wrap, setWrap] = useState7(false);
  const [expanded, setExpanded] = useState7(false);
  const [reveal, setReveal] = useState7(false);
  const [level, setLevel] = useState7(1);
  const [epoch, setEpoch] = useState7(0);
  const [visible, setVisible] = useState7(CHUNK);
  const [searchOpen, setSearchOpen] = useState7(false);
  const [query, setQuery] = useState7("");
  const [active, setActive] = useState7(0);
  const [count, setCount] = useState7(0);
  const scrollRef = useRef6(null);
  const text = encoding === "base64" ? "" : body ?? "";
  const isPlaceholder = !!body && body.length < 300 && PLACEHOLDER.test(body);
  const huge = text.length > HUGE;
  const json = useMemo2(() => {
    if (encoding === "base64" || isPlaceholder || huge || !text) return null;
    const t = text.trimStart();
    if (!/json/i.test(contentType) && t[0] !== "{" && t[0] !== "[") return null;
    try {
      return { value: JSON.parse(text) };
    } catch {
      return null;
    }
  }, [text, contentType, encoding, isPlaceholder, huge]);
  const effectiveMode = mode ?? (json ? "tree" : "raw");
  const { shownText, hasSecrets } = useMemo2(() => {
    if (!json) return { shownText: text, hasSecrets: false };
    const plain = JSON.stringify(json.value, null, 2);
    const masked = JSON.stringify(redactValue(json.value, rules, "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"), null, 2);
    return { shownText: reveal ? plain : masked, hasSecrets: plain !== masked };
  }, [json, text, rules, reveal]);
  useEffect3(() => {
    const root = scrollRef.current;
    if (!root || !query) return setCount(0);
    const marks = root.querySelectorAll("mark");
    setCount(marks.length);
    const idx = marks.length ? Math.min(active, marks.length - 1) : 0;
    marks.forEach((m, i) => m.classList.toggle("active", i === idx));
    marks[idx]?.scrollIntoView({ block: "nearest" });
  }, [query, active, effectiveMode, shownText, visible, level, epoch, wrap, expanded]);
  if (body == null || body === "" && encoding !== "base64") {
    return /* @__PURE__ */ jsx8("div", { className: "ndt-empty-inline", children: "No body" });
  }
  const mime = contentType.split(";")[0] || "application/octet-stream";
  const download = () => encoding === "base64" ? downloadText(`${filename}.${extFor(contentType, false)}`, body, mime, true) : downloadText(`${filename}.${extFor(contentType, !!json)}`, body, mime);
  if (encoding === "base64") {
    const isImage = /^image\//i.test(contentType);
    return /* @__PURE__ */ jsxs7("div", { className: "ndt-body", children: [
      /* @__PURE__ */ jsxs7("div", { className: "ndt-body-bar", children: [
        /* @__PURE__ */ jsxs7("span", { className: "ndt-muted", children: [
          "[binary \xB7 ",
          mime,
          " \xB7 ",
          formatBytes(size),
          "]"
        ] }),
        /* @__PURE__ */ jsx8("span", { className: "ndt-spacer" }),
        /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", onClick: download, children: [
          /* @__PURE__ */ jsx8(IconDownload, {}),
          " Download"
        ] })
      ] }),
      isImage && /* @__PURE__ */ jsx8("div", { className: "ndt-body-scroll ndt-preview", children: /* @__PURE__ */ jsx8("img", { src: `data:${mime};base64,${body}`, alt: "Response preview" }) })
    ] });
  }
  if (isPlaceholder) return /* @__PURE__ */ jsx8("div", { className: "ndt-empty-inline", children: body });
  if (huge) {
    return /* @__PURE__ */ jsx8("div", { className: "ndt-body", children: /* @__PURE__ */ jsxs7("div", { className: "ndt-body-bar", children: [
      /* @__PURE__ */ jsxs7("span", { className: "ndt-muted", children: [
        formatBytes(text.length),
        " \u2014 too large to render safely"
      ] }),
      /* @__PURE__ */ jsx8("span", { className: "ndt-spacer" }),
      /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", onClick: download, children: [
        /* @__PURE__ */ jsx8(IconDownload, {}),
        " Download full body"
      ] })
    ] }) });
  }
  const modes = json ? ["tree", "raw", "preview"] : ["raw", "preview"];
  const lazy = shownText.length > LARGE;
  const rawText = lazy ? shownText.slice(0, visible) : shownText;
  const lines = effectiveMode === "raw" ? rawText.split("\n") : [];
  const bump = () => setEpoch((e) => e + 1);
  const preview = () => {
    if (/html/i.test(contentType)) return /* @__PURE__ */ jsx8("iframe", { className: "ndt-iframe", title: "HTML preview", sandbox: "", srcDoc: text });
    if (/^image\/svg/i.test(contentType)) return /* @__PURE__ */ jsx8("img", { src: `data:${mime};utf8,${encodeURIComponent(text)}`, alt: "SVG preview" });
    return /* @__PURE__ */ jsxs7("div", { className: "ndt-empty-inline", children: [
      "No visual preview for ",
      mime || "this content type",
      ". Use Tree or Raw."
    ] });
  };
  return /* @__PURE__ */ jsxs7(
    "div",
    {
      className: "ndt-body",
      tabIndex: 0,
      onKeyDown: (e) => {
        if (e.key === "f" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setSearchOpen(true);
        }
      },
      children: [
        /* @__PURE__ */ jsxs7("div", { className: "ndt-body-bar", children: [
          /* @__PURE__ */ jsx8("div", { className: "ndt-seg", role: "tablist", "aria-label": "View mode", children: modes.map((m) => /* @__PURE__ */ jsx8("button", { type: "button", role: "tab", "aria-selected": effectiveMode === m, onClick: () => setMode(m), children: m === "tree" ? "Tree" : m === "raw" ? "Raw" : "Preview" }, m)) }),
          /* @__PURE__ */ jsx8("span", { className: "ndt-spacer" }),
          effectiveMode === "tree" && /* @__PURE__ */ jsxs7(Fragment4, { children: [
            /* @__PURE__ */ jsx8("button", { type: "button", className: "ndt-btn", onClick: () => {
              setLevel(1e9);
              bump();
            }, children: "Expand all" }),
            /* @__PURE__ */ jsx8("button", { type: "button", className: "ndt-btn", onClick: () => {
              setLevel(0);
              bump();
            }, children: "Collapse" }),
            /* @__PURE__ */ jsxs7("select", { className: "ndt-select", "aria-label": "Expand to level", value: level >= 1e9 || level === 0 ? "" : level, onChange: (e) => {
              setLevel(Number(e.target.value));
              bump();
            }, children: [
              /* @__PURE__ */ jsx8("option", { value: "", disabled: true, children: "Level\u2026" }),
              [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ jsxs7("option", { value: n, children: [
                "Level ",
                n
              ] }, n))
            ] })
          ] }),
          hasSecrets && /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", onClick: () => setReveal(!reveal), children: [
            reveal ? "Mask" : "Reveal",
            " secrets"
          ] }),
          /* @__PURE__ */ jsx8("button", { type: "button", className: "ndt-btn", "aria-label": "Search in body (Ctrl+F)", title: "Search (Ctrl/Cmd+F)", onClick: () => setSearchOpen(!searchOpen), children: /* @__PURE__ */ jsx8(IconSearch, {}) }),
          effectiveMode === "raw" && /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", "aria-pressed": wrap, title: "Soft wrap", onClick: () => setWrap(!wrap), children: [
            /* @__PURE__ */ jsx8(IconWrap, {}),
            " Wrap"
          ] }),
          /* @__PURE__ */ jsx8(CopyButton, { getText: () => text }),
          /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", "aria-pressed": expanded, onClick: () => setExpanded(!expanded), children: [
            /* @__PURE__ */ jsx8(IconExpand, {}),
            " ",
            expanded ? "Collapse" : "Expand"
          ] }),
          /* @__PURE__ */ jsx8("button", { type: "button", className: "ndt-btn", onClick: download, "aria-label": "Download body", children: /* @__PURE__ */ jsx8(IconDownload, {}) })
        ] }),
        searchOpen && /* @__PURE__ */ jsxs7("div", { className: "ndt-body-search", children: [
          /* @__PURE__ */ jsx8(
            "input",
            {
              autoFocus: true,
              className: "ndt-input",
              placeholder: "Find in body\u2026",
              value: query,
              onChange: (e) => {
                setQuery(e.target.value);
                setActive(0);
              },
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (count) setActive((a) => e.shiftKey ? (a - 1 + count) % count : (a + 1) % count);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setSearchOpen(false);
                  setQuery("");
                }
              }
            }
          ),
          /* @__PURE__ */ jsx8("span", { className: "ndt-muted ndt-tnum", "aria-live": "polite", children: query ? `${count ? Math.min(active, count - 1) + 1 : 0}/${count}` : "" }),
          /* @__PURE__ */ jsx8("button", { type: "button", className: "ndt-icon-btn", "aria-label": "Close search", onClick: () => {
            setSearchOpen(false);
            setQuery("");
          }, children: /* @__PURE__ */ jsx8(IconX, {}) })
        ] }),
        truncated && /* @__PURE__ */ jsx8("div", { className: "ndt-note", children: "Body truncated at 10MB." }),
        /* @__PURE__ */ jsxs7("div", { ref: scrollRef, className: `ndt-body-scroll ${expanded ? "is-expanded" : ""}`, children: [
          effectiveMode === "tree" && json && /* @__PURE__ */ jsx8(JsonTree, { value: json.value, query, level, epoch, rules: reveal ? [] : rules }),
          effectiveMode === "raw" && /* @__PURE__ */ jsxs7("div", { className: `ndt-raw ${wrap ? "wrap" : ""}`, children: [
            lines.map((l, i) => /* @__PURE__ */ jsxs7("div", { className: "ndt-raw-line", children: [
              /* @__PURE__ */ jsx8("span", { className: "ndt-ln", children: i + 1 }),
              /* @__PURE__ */ jsx8("span", { className: "ndt-lt", children: query ? highlight(l, query) : l || " " })
            ] }, i)),
            lazy && visible < shownText.length && /* @__PURE__ */ jsxs7("button", { type: "button", className: "ndt-btn", onClick: () => setVisible(visible + CHUNK), children: [
              "Load more (",
              formatBytes(shownText.length - visible),
              " remaining)"
            ] })
          ] }),
          effectiveMode === "preview" && /* @__PURE__ */ jsx8("div", { className: "ndt-preview", children: preview() })
        ] })
      ]
    }
  );
}

// src/client/components/detail-view.tsx
import { Fragment as Fragment5, jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function MethodBadge({ method }) {
  return /* @__PURE__ */ jsx9("span", { className: `ndt-method tone-${methodTone(method)}`, children: method });
}
function StatusBadge({ entry }) {
  const status = entry.response?.status;
  const tone2 = statusTone(status, entry.state);
  const label = entry.state === "pending" ? "\u2026" : entry.state === "failed" || !status ? "ERR" : String(status);
  return /* @__PURE__ */ jsx9("span", { className: `ndt-status tone-${tone2}`, children: label });
}
function splitUrl(raw) {
  try {
    const u = new URL(raw, typeof location !== "undefined" ? location.href : void 0);
    const foreign = typeof location !== "undefined" && u.origin !== location.origin;
    return { host: foreign ? u.origin : "", path: u.pathname, query: u.search };
  } catch {
    return { host: "", path: raw, query: "" };
  }
}
function HeaderList({ headers }) {
  const rows = Object.entries(headers);
  if (!rows.length) return /* @__PURE__ */ jsx9("div", { className: "ndt-muted", children: "None" });
  return /* @__PURE__ */ jsx9("dl", { className: "ndt-kv ndt-mono", children: rows.map(([k, v]) => /* @__PURE__ */ jsxs8(React8.Fragment, { children: [
    /* @__PURE__ */ jsx9("dt", { children: k }),
    /* @__PURE__ */ jsx9("dd", { children: /* @__PURE__ */ jsx9(MaskedValue, { name: k, value: v }) })
  ] }, k)) });
}
function CopySplitButton({ entry, onViewCurl }) {
  const { copy, includeCookie, setIncludeCookie } = useCopy();
  const [open, setOpen] = useState8(false);
  const [done2, flash] = useFlash();
  const run = async (kind) => {
    setOpen(false);
    if (await copy(entry, kind)) flash();
  };
  return /* @__PURE__ */ jsxs8("div", { className: "ndt-split", children: [
    /* @__PURE__ */ jsxs8("button", { type: "button", className: "ndt-btn", onClick: () => run("curl"), children: [
      done2 ? /* @__PURE__ */ jsx9(IconCheck, {}) : null,
      done2 ? "Copied \u2713" : "Copy cURL"
    ] }),
    /* @__PURE__ */ jsx9("button", { type: "button", className: "ndt-btn ndt-split-caret", "aria-label": "More copy options", "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen(!open), children: /* @__PURE__ */ jsx9(IconChevronDown, {}) }),
    open && /* @__PURE__ */ jsxs8("div", { className: "ndt-menu", role: "menu", onMouseLeave: () => setOpen(false), children: [
      ["curl-cmd", "curl-ps", "fetch", "har", "curl-redacted"].map((k) => /* @__PURE__ */ jsx9("button", { type: "button", role: "menuitem", onClick: () => run(k), children: COPY_LABELS[k] }, k)),
      /* @__PURE__ */ jsx9("button", { type: "button", role: "menuitem", onClick: () => {
        setOpen(false);
        onViewCurl();
      }, children: "View cURL" }),
      /* @__PURE__ */ jsxs8("label", { className: "ndt-menu-check", children: [
        /* @__PURE__ */ jsx9("input", { type: "checkbox", checked: includeCookie, onChange: (e) => setIncludeCookie(e.target.checked) }),
        "Include cookie header"
      ] })
    ] })
  ] });
}
function DetailView({ entry, onBack }) {
  const { request: req, response: res } = entry;
  const [sub, setSub] = useState8("headers");
  const [showCurl, setShowCurl] = useState8(false);
  const { command, copy } = useCopy();
  const { host, path, query } = splitUrl(req.url);
  const summary = entry.state === "pending" ? "Pending\u2026" : entry.state === "failed" ? `Failed \xB7 ${entry.error ?? "Network error"} \xB7 ${formatDuration(res?.durationMs)}` : `${res?.status} ${res?.statusText} \xB7 ${formatDuration(res?.durationMs)} \xB7 ${formatBytes(res?.size)}`;
  let params = [];
  try {
    params = [...new URL(req.url, location.href).searchParams];
  } catch {
  }
  return /* @__PURE__ */ jsxs8("div", { className: "ndt-detail", children: [
    /* @__PURE__ */ jsxs8("div", { className: "ndt-detail-head", children: [
      /* @__PURE__ */ jsxs8("button", { type: "button", className: "ndt-btn", onClick: onBack, children: [
        /* @__PURE__ */ jsx9(IconArrowLeft, {}),
        " Back"
      ] }),
      /* @__PURE__ */ jsxs8("span", { className: "ndt-detail-title", title: req.url, children: [
        /* @__PURE__ */ jsx9(MethodBadge, { method: req.method }),
        " ",
        host,
        path,
        /* @__PURE__ */ jsx9("span", { className: "ndt-muted", children: query })
      ] }),
      /* @__PURE__ */ jsx9(CopySplitButton, { entry, onViewCurl: () => setShowCurl((s) => !s) })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "ndt-summary", children: [
      summary,
      " \xB7 ",
      entry.origin === "server" ? "Server" : "Client"
    ] }),
    showCurl && /* @__PURE__ */ jsxs8("div", { className: "ndt-curl-pop", children: [
      /* @__PURE__ */ jsx9("pre", { className: "ndt-code", tabIndex: 0, children: command(entry, "curl") }),
      /* @__PURE__ */ jsx9("button", { type: "button", className: "ndt-btn", onClick: () => copy(entry, "curl"), children: "Copy" }),
      /* @__PURE__ */ jsx9("button", { type: "button", className: "ndt-btn", onClick: () => setShowCurl(false), children: "Close" })
    ] }),
    /* @__PURE__ */ jsx9("div", { className: "ndt-subtabs", role: "tablist", children: ["headers", "payload", "response", "timing"].map((s) => /* @__PURE__ */ jsx9("button", { type: "button", role: "tab", "aria-selected": sub === s, onClick: () => setSub(s), children: s[0].toUpperCase() + s.slice(1) }, s)) }),
    /* @__PURE__ */ jsxs8("div", { className: "ndt-detail-body", children: [
      sub === "headers" && /* @__PURE__ */ jsxs8(Fragment5, { children: [
        /* @__PURE__ */ jsx9(Accordion, { title: "General", defaultOpen: true, children: /* @__PURE__ */ jsx9(
          KV,
          {
            rows: [
              ["URL", /* @__PURE__ */ jsx9("span", { className: "ndt-wrap-anywhere", children: req.url }, "u")],
              ["Method", req.method],
              ["Status", res ? `${res.status} ${res.statusText}` : "\u2014"],
              ["Origin", entry.origin],
              ["Started", new Date(req.timestamp).toLocaleTimeString()]
            ]
          }
        ) }),
        /* @__PURE__ */ jsx9(Accordion, { title: "Request Headers", count: Object.keys(req.headers).length, defaultOpen: true, children: /* @__PURE__ */ jsx9(HeaderList, { headers: req.headers }) }),
        /* @__PURE__ */ jsx9(Accordion, { title: "Response Headers", count: Object.keys(res?.headers ?? {}).length, children: /* @__PURE__ */ jsx9(HeaderList, { headers: res?.headers ?? {} }) })
      ] }),
      sub === "payload" && /* @__PURE__ */ jsxs8(Fragment5, { children: [
        params.length > 0 && /* @__PURE__ */ jsx9(Accordion, { title: "Query String", count: params.length, defaultOpen: true, children: /* @__PURE__ */ jsx9(KV, { rows: params }) }),
        req.bodyForm ? /* @__PURE__ */ jsx9(Accordion, { title: "Form Data", count: req.bodyForm.length, defaultOpen: true, children: /* @__PURE__ */ jsx9("dl", { className: "ndt-kv ndt-mono", children: req.bodyForm.map(([k, v], i) => /* @__PURE__ */ jsxs8(React8.Fragment, { children: [
          /* @__PURE__ */ jsx9("dt", { children: k }),
          /* @__PURE__ */ jsx9("dd", { children: /* @__PURE__ */ jsx9(MaskedValue, { name: k, value: v }) })
        ] }, `${k}-${i}`)) }) }) : req.bodyNote ? /* @__PURE__ */ jsx9("div", { className: "ndt-empty-inline", children: req.bodyNote }) : req.body ? /* @__PURE__ */ jsx9(BodyViewer, { body: req.body, contentType: req.headers["content-type"], size: req.body.length, filename: "request" }, `${entry.id}-req`) : /* @__PURE__ */ jsx9("div", { className: "ndt-empty-inline", children: "No request payload" })
      ] }),
      sub === "response" && (res ? /* @__PURE__ */ jsx9(
        BodyViewer,
        {
          body: res.body,
          encoding: res.bodyEncoding,
          contentType: res.contentType,
          size: res.size,
          truncated: res.bodyTruncated,
          filename: "response"
        },
        `${entry.id}-res-${res.status}`
      ) : /* @__PURE__ */ jsx9("div", { className: "ndt-empty-inline", children: entry.state === "pending" ? "Waiting for response\u2026" : entry.error ?? "No response" })),
      sub === "timing" && /* @__PURE__ */ jsx9(Timing, { entry })
    ] })
  ] });
}
function Timing({ entry }) {
  const res = entry.response;
  if (!res) return /* @__PURE__ */ jsx9("div", { className: "ndt-empty-inline", children: "Timing is available once the request finishes." });
  const total = Math.max(res.durationMs, 1e-3);
  const rows = [
    ["Waiting (TTFB)", res.ttfbMs, "tone-info"],
    ["Content download", res.downloadMs, "tone-success"]
  ];
  let offset = 0;
  return /* @__PURE__ */ jsxs8("div", { className: "ndt-timing", children: [
    rows.map(([label, ms, tone2]) => {
      if (ms == null) return null;
      const left = offset / total * 100;
      offset += ms;
      return /* @__PURE__ */ jsxs8("div", { className: "ndt-timing-row", children: [
        /* @__PURE__ */ jsx9("span", { children: label }),
        /* @__PURE__ */ jsx9("span", { className: "ndt-timing-track", children: /* @__PURE__ */ jsx9("span", { className: `ndt-timing-bar ${tone2}`, style: { left: `${left}%`, width: `${Math.max(ms / total * 100, 1)}%` } }) }),
        /* @__PURE__ */ jsx9("span", { className: "ndt-tnum", children: formatDuration(ms) })
      ] }, label);
    }),
    /* @__PURE__ */ jsxs8("div", { className: "ndt-timing-row", children: [
      /* @__PURE__ */ jsx9("strong", { children: "Total" }),
      /* @__PURE__ */ jsx9("span", {}),
      /* @__PURE__ */ jsx9("strong", { className: "ndt-tnum", children: formatDuration(res.durationMs) })
    ] }),
    /* @__PURE__ */ jsxs8("p", { className: "ndt-muted", children: [
      "Queued / request-sent phases are not measurable from ",
      entry.origin === "server" ? "the server" : "a fetch wrapper",
      "."
    ] })
  ] });
}

// src/client/components/tabs/network-tab.tsx
import { Fragment as Fragment6, jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var ROW_HEIGHT = 28;
function matchesStatus(e, f) {
  if (f === "all") return true;
  if (f === "failed") return e.state === "failed" || e.state === "completed" && !e.response?.status;
  const s = e.response?.status ?? 0;
  return s >= Number(f[0]) * 100 && s < Number(f[0]) * 100 + 100;
}
function NetworkTab({ entries, maximized, waterfall, onClear }) {
  const { copy } = useCopy();
  const [query, setQuery] = useState9("");
  const [status, setStatus] = useState9("all");
  const [origin, setOrigin] = useState9("all");
  const [selectedId, setSelectedId] = useState9(null);
  const [detailOpen, setDetailOpen] = useState9(false);
  const searchRef = useRef7(null);
  const scrollMemory = useRef7(0);
  const filtered = useMemo3(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      if (e.category !== "network") continue;
      if (origin !== "all" && e.origin !== origin) continue;
      if (!matchesStatus(e, status)) continue;
      if (q && !`${e.request.method} ${e.request.url} ${e.response?.status ?? ""}`.toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out;
  }, [entries, query, status, origin]);
  const maxDuration = useMemo3(() => filtered.reduce((m, e) => Math.max(m, e.response?.durationMs ?? 0), 1), [filtered]);
  const selectedIndex = filtered.findIndex((e) => e.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const showDetail = selected && (maximized || detailOpen);
  const move = (delta) => {
    if (!filtered.length) return;
    const next = Math.min(filtered.length - 1, Math.max(0, (selectedIndex < 0 ? delta > 0 ? -1 : 0 : selectedIndex) + delta));
    setSelectedId(filtered[next].id);
  };
  const onKeyDown = (e) => {
    const tag = e.target.tagName;
    if (e.key === "Escape" && (tag === "INPUT" || tag === "SELECT")) {
      e.target.blur();
      e.stopPropagation();
      return;
    }
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!showDetail || maximized) move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!showDetail || maximized) move(-1);
        break;
      case "Enter":
        if (selected) setDetailOpen(true);
        break;
      case "Escape":
        if (detailOpen) {
          setDetailOpen(false);
          e.stopPropagation();
        }
        break;
      case "/":
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case "c":
      case "C":
        if (selected) void copy(selected, "curl");
        break;
    }
  };
  const list = /* @__PURE__ */ jsx10(
    VirtualList,
    {
      items: filtered,
      rowHeight: ROW_HEIGHT,
      selectedIndex,
      scrollMemory,
      empty: "No requests yet. API calls will appear here.",
      renderRow: (e) => {
        const { host, path, query: qs } = splitUrl(e.request.url);
        const dur = e.response?.durationMs;
        return /* @__PURE__ */ jsxs9(
          "div",
          {
            role: "option",
            "aria-selected": e.id === selectedId,
            className: `ndt-row ${e.id === selectedId ? "is-selected" : ""}`,
            onClick: () => {
              setSelectedId(e.id);
              setDetailOpen(true);
            },
            children: [
              /* @__PURE__ */ jsx10(MethodBadge, { method: e.request.method }),
              /* @__PURE__ */ jsxs9("span", { className: "ndt-row-path ndt-mono", title: e.request.url, children: [
                e.origin === "server" && /* @__PURE__ */ jsx10("span", { className: "ndt-origin", title: "Server-side request", children: "S" }),
                host,
                path,
                /* @__PURE__ */ jsx10("span", { className: "ndt-muted", children: qs })
              ] }),
              /* @__PURE__ */ jsx10(StatusBadge, { entry: e }),
              /* @__PURE__ */ jsx10("span", { className: "ndt-row-num ndt-tnum", children: formatDuration(dur) }),
              /* @__PURE__ */ jsx10("span", { className: "ndt-row-num ndt-tnum", children: formatBytes(e.response?.size) }),
              /* @__PURE__ */ jsx10(
                "button",
                {
                  type: "button",
                  className: "ndt-row-copy",
                  "aria-label": "Copy cURL",
                  title: "Copy cURL",
                  onClick: (ev) => {
                    ev.stopPropagation();
                    void copy(e, "curl");
                  },
                  children: "cURL"
                }
              ),
              waterfall && dur != null && /* @__PURE__ */ jsx10("span", { className: "ndt-wf", style: { width: `${Math.max(dur / maxDuration * 100, 1)}%` } })
            ]
          }
        );
      }
    }
  );
  const toolbar = /* @__PURE__ */ jsxs9("div", { className: "ndt-toolbar", children: [
    /* @__PURE__ */ jsxs9("label", { className: "ndt-search", children: [
      /* @__PURE__ */ jsx10(IconSearch, {}),
      /* @__PURE__ */ jsx10("input", { ref: searchRef, className: "ndt-input", placeholder: "Filter\u2026", "aria-label": "Filter requests", value: query, onChange: (e) => setQuery(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs9("select", { className: "ndt-select", "aria-label": "Status filter", value: status, onChange: (e) => setStatus(e.target.value), children: [
      /* @__PURE__ */ jsx10("option", { value: "all", children: "All" }),
      /* @__PURE__ */ jsx10("option", { value: "2xx", children: "2xx" }),
      /* @__PURE__ */ jsx10("option", { value: "3xx", children: "3xx" }),
      /* @__PURE__ */ jsx10("option", { value: "4xx", children: "4xx" }),
      /* @__PURE__ */ jsx10("option", { value: "5xx", children: "5xx" }),
      /* @__PURE__ */ jsx10("option", { value: "failed", children: "Failed" })
    ] }),
    /* @__PURE__ */ jsx10("div", { className: "ndt-seg", role: "group", "aria-label": "Origin filter", children: ["all", "server", "client"].map((o) => /* @__PURE__ */ jsx10("button", { type: "button", "aria-pressed": origin === o, onClick: () => setOrigin(o), children: o === "all" ? "All" : o === "server" ? "Server" : "Client" }, o)) }),
    /* @__PURE__ */ jsx10("button", { type: "button", className: "ndt-icon-btn", "aria-label": "Clear all", title: "Clear all", onClick: onClear, children: /* @__PURE__ */ jsx10(IconTrash, {}) })
  ] });
  if (maximized) {
    return /* @__PURE__ */ jsxs9("div", { className: "ndt-tab", tabIndex: -1, onKeyDown, children: [
      toolbar,
      /* @__PURE__ */ jsxs9("div", { className: "ndt-split-pane", children: [
        /* @__PURE__ */ jsx10("div", { className: "ndt-pane-list", children: list }),
        /* @__PURE__ */ jsx10("div", { className: "ndt-pane-detail", children: selected ? /* @__PURE__ */ jsx10(DetailView, { entry: selected, onBack: () => setSelectedId(null) }, selected.id) : /* @__PURE__ */ jsx10("div", { className: "ndt-empty", children: "Select a request to inspect it." }) })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx10("div", { className: "ndt-tab", tabIndex: -1, onKeyDown, children: showDetail ? /* @__PURE__ */ jsx10(DetailView, { entry: selected, onBack: () => setDetailOpen(false) }, selected.id) : /* @__PURE__ */ jsxs9(Fragment6, { children: [
    toolbar,
    list
  ] }) });
}

// src/client/components/tabs/system-tab.tsx
import { Fragment as Fragment7, jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
function Group({ title, rows }) {
  return /* @__PURE__ */ jsxs10("section", { className: "ndt-group", children: [
    /* @__PURE__ */ jsx11("h4", { className: "ndt-h", children: title }),
    /* @__PURE__ */ jsx11(KV, { rows })
  ] });
}
var SSE_LABEL = {
  idle: "Idle",
  connecting: "Connecting\u2026",
  open: "Connected",
  closed: "Disconnected \u2014 is app/api/next-devtools/sse/route.ts mounted? (run npx next-devtools-widget init)"
};
function SystemTab({ system, sse }) {
  const mem = system?.memory;
  const pct = mem ? Math.round(mem.heapUsed / mem.heapTotal * 100) : 0;
  return /* @__PURE__ */ jsxs10("div", { className: "ndt-tab ndt-scroll", tabIndex: -1, children: [
    /* @__PURE__ */ jsx11(Group, { title: "Connection", rows: [["Server stream (SSE)", /* @__PURE__ */ jsx11("span", { className: `ndt-status tone-${sse === "open" ? "success" : sse === "closed" ? "destructive" : "muted"}`, children: SSE_LABEL[sse] }, "s")]] }),
    !system ? /* @__PURE__ */ jsx11("div", { className: "ndt-empty-inline", children: "Waiting for server diagnostics\u2026" }) : /* @__PURE__ */ jsxs10(Fragment7, { children: [
      /* @__PURE__ */ jsx11(
        Group,
        {
          title: "Runtime",
          rows: [
            ["Runtime", system.runtime],
            ["Node.js", system.nodeVersion],
            ["Platform", `${system.platform} \xB7 ${system.arch}`],
            ["PID", String(system.pid)],
            ["Uptime", `${system.uptimeSec}s`]
          ]
        }
      ),
      /* @__PURE__ */ jsx11(Group, { title: "Next.js", rows: [["Version", system.nextVersion], ["NODE_ENV", system.nodeEnv]] }),
      /* @__PURE__ */ jsx11(
        Group,
        {
          title: "Memory",
          rows: [
            ["Heap", /* @__PURE__ */ jsxs10("span", { className: "ndt-mem", children: [
              /* @__PURE__ */ jsx11("span", { className: "ndt-mem-bar", children: /* @__PURE__ */ jsx11("span", { style: { width: `${pct}%` } }) }),
              formatBytes(mem.heapUsed),
              " / ",
              formatBytes(mem.heapTotal)
            ] }, "h")],
            ["RSS", formatBytes(mem.rss)],
            ["External", formatBytes(mem.external)]
          ]
        }
      )
    ] })
  ] });
}

// src/client/components/trigger-button.tsx
import { jsx as jsx12 } from "react/jsx-runtime";
function TriggerButton(p) {
  return /* @__PURE__ */ jsx12(
    "button",
    {
      ref: p.innerRef,
      type: "button",
      id: "next-devtools-trigger",
      className: `ndt-pill ${p.open ? "is-open" : ""} ${p.dragging ? "is-dragging" : ""} ${p.animate ? "" : "no-anim"}`,
      style: { transform: `translate(${p.x}px, ${p.y}px)` },
      "aria-label": "Next DevTools",
      "aria-expanded": p.open,
      "aria-haspopup": "dialog",
      onPointerDown: p.onPointerDown,
      onPointerMove: p.onPointerMove,
      onPointerUp: p.onPointerUp,
      onPointerCancel: p.onPointerUp,
      onClick: p.onClick,
      onContextMenu: p.onContextMenu,
      children: /* @__PURE__ */ jsx12(IconLogo, { size: 18 })
    }
  );
}

// src/client/cookie-transport.ts
var TRACE_COOKIE_PREFIX = "__ndt_trace_";
function drainTraceCookies(emit) {
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
      const entry = JSON.parse(decoded);
      if (entry && typeof entry === "object" && entry.id && entry.category) {
        emit(entry);
      }
    } catch {
    } finally {
      document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    }
  }
}

// src/client/patch-client.ts
var PATCHED = "__NEXT_DEVTOOLS_FETCH_PATCHED__";
function setupClientFetchProxy(emit) {
  const w = window;
  if (typeof w.fetch !== "function" || w[PATCHED] || w.fetch[PATCHED]) return;
  w[PATCHED] = true;
  const originalFetch = w.fetch;
  const devtoolsFetch = function devtoolsFetch2(...args) {
    const promise = originalFetch.apply(window, args);
    try {
      const url = getUrl(args[0]);
      const headers = getRequestHeaders(args[0], args[1]);
      if (!isInternalRequest(url, headers)) observe(url, args, headers, promise, emit);
    } catch {
    }
    return promise;
  };
  devtoolsFetch[PATCHED] = true;
  w.fetch = devtoolsFetch;
}
function observe(url, [input, init], headers, promise, emit) {
  const method = getMethod(input, init);
  const startTime = Date.now();
  const t0 = performance.now();
  const actionId = headers["next-action"];
  const id = genId(actionId ? "act" : "cli");
  const request = { url, method, headers, ...describeBody(init?.body), timestamp: startTime };
  const entry = { id, category: "network", origin: "client", state: "pending", request };
  emit(entry);
  const actionBase = () => ({
    id: `act_${id}`,
    category: "action",
    origin: "client",
    actionName: `Server Action ${actionId.slice(0, 8)}`,
    args: [request.body ?? request.bodyForm ?? request.bodyNote ?? null],
    timestamp: startTime
  });
  promise.then(
    async (response) => {
      const ttfbMs = performance.now() - t0;
      const clone = safeClone(response);
      const tBody = performance.now();
      const captured = clone ? await captureResponseBody(clone) : null;
      const now = performance.now();
      emit({
        ...entry,
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
      });
      if (actionId) {
        emit({
          ...actionBase(),
          result: captured?.body ?? null,
          error: response.ok ? void 0 : `${response.status} ${response.statusText}`,
          durationMs: now - t0
        });
      }
      drainTraceCookies(emit);
      setTimeout(() => drainTraceCookies(emit), 20);
      setTimeout(() => drainTraceCookies(emit), 100);
      setTimeout(() => drainTraceCookies(emit), 300);
    },
    (err) => {
      const message = err?.message || "Client fetch failed";
      emit({
        ...entry,
        state: "failed",
        error: err?.name === "AbortError" ? "Aborted" : message,
        response: { status: 0, statusText: "CLIENT_ERROR", headers: {}, durationMs: performance.now() - t0 }
      });
      if (actionId) {
        emit({ ...actionBase(), error: message, durationMs: performance.now() - t0 });
      }
      drainTraceCookies(emit);
      setTimeout(() => drainTraceCookies(emit), 20);
      setTimeout(() => drainTraceCookies(emit), 100);
      setTimeout(() => drainTraceCookies(emit), 300);
    }
  );
}

// src/client/shadow-wrapper.tsx
import { useEffect as useEffect4, useRef as useRef8, useState as useState10 } from "react";
import { createPortal } from "react-dom";

// src/client/styles.ts
var DEVTOOLS_ISOLATED_CSS = `
:host {
  --radius: 0.5rem;
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 40%;
  --border: 240 5.9% 90%;
  --ring: 240 5% 54%;
  --success: 142 71% 30%;
  --warning: 32 92% 36%;
  --destructive: 0 72% 46%;
  --info: 217 91% 48%;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  color-scheme: light;
}
:host([data-theme='dark']) {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 68%;
  --border: 240 3.7% 20%;
  --ring: 240 5% 64.9%;
  --success: 142 71% 48%;
  --warning: 38 92% 58%;
  --destructive: 0 80% 66%;
  --info: 217 91% 68%;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
.ndt-root { font: 12px/1.45 var(--font-sans); color: hsl(var(--foreground)); pointer-events: none; }
.ndt-root button, .ndt-root input, .ndt-root select { font: inherit; color: inherit; }
.ndt-root :focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
.ndt-mono { font-family: var(--font-mono); }
.ndt-muted { color: hsl(var(--muted-foreground)); }
.ndt-tnum { font-variant-numeric: tabular-nums; }
.ndt-spacer { flex: 1; }
.ndt-wrap-anywhere { overflow-wrap: anywhere; }
.tone-success { color: hsl(var(--success)); }
.tone-info { color: hsl(var(--info)); }
.tone-warning { color: hsl(var(--warning)); }
.tone-destructive, .tone-destructive-text { color: hsl(var(--destructive)); }
.tone-muted { color: hsl(var(--muted-foreground)); }

/* ---------- trigger button ---------- */
.ndt-pill {
  position: fixed; left: 0; top: 0; width: 36px; height: 36px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 1px solid hsl(var(--border));
  background: hsl(var(--background) / 0.92); backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12), 0 1px 2px hsl(0 0% 0% / 0.08);
  pointer-events: auto; cursor: grab; opacity: 0.85; user-select: none; touch-action: none;
  color: hsl(var(--foreground));
  transition: transform 160ms ease-out, opacity 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out;
}
.ndt-pill.no-anim { transition: none; }
.ndt-pill:hover, .ndt-pill:focus-visible, .ndt-pill.is-open {
  opacity: 1;
  border-color: hsl(var(--ring) / 0.5);
  box-shadow: 0 4px 14px hsl(0 0% 0% / 0.2);
}
.ndt-pill.is-dragging { transition: none; cursor: grabbing; opacity: 1; }
.ndt-logo { display: inline-block; vertical-align: middle; flex-shrink: 0; }
@keyframes ndt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ---------- panel ---------- */
.ndt-panel {
  position: fixed; display: flex; flex-direction: column; pointer-events: auto; overflow: hidden;
  background: hsl(var(--background)); border: 1px solid hsl(var(--border));
  border-radius: var(--radius); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.08); outline: none;
}
.ndt-header { height: 36px; flex: none; display: flex; align-items: stretch; gap: 4px; padding: 0 4px 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-brand { display: flex; align-items: center; padding: 0 4px 0 2px; color: hsl(var(--foreground)); flex: none; opacity: 0.85; }
.ndt-tabs { display: flex; gap: 2px; flex: 1; min-width: 0; }
.ndt-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0 8px; cursor: pointer; color: hsl(var(--muted-foreground)); font-size: 13px; }
.ndt-tabs button[aria-selected='true'] { color: hsl(var(--foreground)); border-bottom-color: hsl(var(--foreground)); }
.ndt-tabs button:hover { color: hsl(var(--foreground)); }
.ndt-header-actions { display: flex; align-items: center; gap: 2px; }
.ndt-main { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
.ndt-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; }
.ndt-scroll { overflow: auto; padding: 8px; }
.ndt-grip { position: absolute; width: 14px; height: 14px; z-index: 3; touch-action: none; opacity: 0.5; }
.ndt-grip:hover { opacity: 1; }
.ndt-grip::after { content: ''; position: absolute; inset: 3px; border: 0 solid hsl(var(--muted-foreground)); }
.grip-tl { top: 0; left: 0; cursor: nwse-resize; } .grip-tl::after { border-top-width: 1.5px; border-left-width: 1.5px; }
.grip-tr { top: 0; right: 0; cursor: nesw-resize; } .grip-tr::after { border-top-width: 1.5px; border-right-width: 1.5px; }
.grip-bl { bottom: 0; left: 0; cursor: nesw-resize; } .grip-bl::after { border-bottom-width: 1.5px; border-left-width: 1.5px; }
.grip-br { bottom: 0; right: 0; cursor: nwse-resize; } .grip-br::after { border-bottom-width: 1.5px; border-right-width: 1.5px; }

/* ---------- controls ---------- */
.ndt-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: none; border: 0; border-radius: 6px; cursor: pointer; color: hsl(var(--muted-foreground)); align-self: center; }
.ndt-icon-btn:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.ndt-btn { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; background: transparent; border: 1px solid hsl(var(--border)); border-radius: 6px; cursor: pointer; font-size: 11px; white-space: nowrap; }
.ndt-btn:hover { background: hsl(var(--muted)); }
.ndt-btn[aria-pressed='true'] { background: hsl(var(--muted)); }
.ndt-link { background: none; border: 0; padding: 0 2px; cursor: pointer; color: hsl(var(--info)); font-size: inherit; text-decoration: underline; }
.ndt-input { background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; min-width: 0; flex: 1; height: 24px; }
.ndt-input:hover { border-color: hsl(var(--border)); }
.ndt-select { height: 24px; background: transparent; border: 1px solid hsl(var(--border)); border-radius: 6px; padding: 0 4px; }
.ndt-select option { background: hsl(var(--background)); color: hsl(var(--foreground)); }
.ndt-seg { display: inline-flex; border: 1px solid hsl(var(--border)); border-radius: 6px; overflow: hidden; flex: none; }
.ndt-seg button { background: none; border: 0; padding: 0 8px; height: 22px; cursor: pointer; font-size: 11px; color: hsl(var(--muted-foreground)); }
.ndt-seg button + button { border-left: 1px solid hsl(var(--border)); }
.ndt-seg button[aria-pressed='true'], .ndt-seg button[aria-selected='true'] { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.ndt-toolbar { height: 32px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-search { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; color: hsl(var(--muted-foreground)); }
.ndt-search .ndt-input { color: hsl(var(--foreground)); }

/* ---------- list ---------- */
.ndt-vlist { flex: 1; min-height: 0; overflow: auto; position: relative; }
.ndt-vrow { position: absolute; left: 0; right: 0; }
.ndt-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; color: hsl(var(--muted-foreground)); }
.ndt-empty-inline { padding: 10px 8px; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ndt-row { position: relative; height: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) 38px 52px 52px; gap: 6px; align-items: center; padding: 0 8px; font-family: var(--font-mono); cursor: pointer; border-bottom: 1px solid hsl(var(--border) / 0.5); }
.ndt-row-simple { grid-template-columns: minmax(0, 1fr) 52px 56px; }
.ndt-row:hover { background: hsl(var(--muted) / 0.7); }
.ndt-row.is-selected { background: hsl(var(--muted)); }
.ndt-row-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ndt-row-num { text-align: right; color: hsl(var(--muted-foreground)); }
.ndt-origin { display: inline-block; margin-right: 4px; padding: 0 3px; font-size: 9px; border: 1px solid hsl(var(--border)); border-radius: 3px; color: hsl(var(--muted-foreground)); }
.ndt-row-copy { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; height: 20px; padding: 0 6px; font-size: 10px; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 4px; cursor: pointer; }
.ndt-row:hover .ndt-row-copy, .ndt-row-copy:focus-visible { display: block; }
.ndt-wf { position: absolute; left: 0; bottom: 0; height: 2px; background: hsl(var(--info) / 0.6); }
.ndt-method { font-weight: 600; font-size: 11px; }
.ndt-status { font-family: var(--font-mono); font-weight: 500; text-align: right; }
.ndt-split-pane { flex: 1; min-height: 0; display: grid; grid-template-columns: 35% 65%; }
.ndt-pane-list { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid hsl(var(--border)); }
.ndt-pane-detail { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.ndt-pane-list .ndt-row { grid-template-columns: 44px minmax(0, 1fr) 38px 52px; }
.ndt-pane-list .ndt-row-num:last-of-type { display: none; }

/* ---------- detail ---------- */
.ndt-detail { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ndt-detail-head { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-detail-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.ndt-summary { padding: 4px 8px; font-size: 11px; color: hsl(var(--muted-foreground)); border-bottom: 1px solid hsl(var(--border)); overflow-wrap: anywhere; }
.ndt-subtabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-subtabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 5px 8px; cursor: pointer; color: hsl(var(--muted-foreground)); }
.ndt-subtabs button[aria-selected='true'] { color: hsl(var(--foreground)); border-bottom-color: hsl(var(--foreground)); }
.ndt-detail-body { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.ndt-kv { display: grid; grid-template-columns: minmax(80px, 30%) minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 11px; }
.ndt-kv dt { color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ndt-kv dd { margin: 0; overflow-wrap: anywhere; }
.ndt-acc + .ndt-acc { margin-top: 4px; }
.ndt-acc-head { display: flex; align-items: center; gap: 4px; width: 100%; background: none; border: 0; padding: 4px 0; cursor: pointer; font-weight: 600; text-align: left; }
.ndt-acc-body { padding: 2px 0 6px 16px; }
.ndt-h { margin: 8px 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: hsl(var(--muted-foreground)); }
.ndt-group + .ndt-group { margin-top: 8px; }
.ndt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ndt-chip { padding: 1px 6px; border: 1px solid hsl(var(--border)); border-radius: 4px; font-family: var(--font-mono); font-size: 11px; }
.ndt-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ndt-timeline li { display: flex; gap: 8px; align-items: center; }
.ndt-code { margin: 0; padding: 6px 8px; background: hsl(var(--muted)); border-radius: 6px; font-family: var(--font-mono); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; flex: 1; }
.ndt-curl-pop { display: flex; gap: 6px; align-items: flex-start; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-mem { display: inline-flex; align-items: center; gap: 8px; }
.ndt-mem-bar { width: 80px; height: 6px; background: hsl(var(--muted)); border-radius: 3px; overflow: hidden; }
.ndt-mem-bar > span { display: block; height: 100%; background: hsl(var(--info)); }
.ndt-timing { display: grid; gap: 6px; }
.ndt-timing-row { display: grid; grid-template-columns: 120px 1fr 56px; gap: 8px; align-items: center; }
.ndt-timing-row .ndt-tnum { text-align: right; }
.ndt-timing-track { position: relative; height: 8px; background: hsl(var(--muted)); border-radius: 4px; overflow: hidden; }
.ndt-timing-bar { position: absolute; top: 0; bottom: 0; background: currentColor; border-radius: 4px; }

/* ---------- split button / menus ---------- */
.ndt-split { position: relative; display: inline-flex; flex: none; }
.ndt-split > .ndt-btn:first-child { border-radius: 6px 0 0 6px; }
.ndt-split-caret { border-radius: 0 6px 6px 0; border-left: 0; padding: 0 4px; }
.ndt-menu, .ndt-ctx { position: absolute; z-index: 6; min-width: 190px; display: flex; flex-direction: column; padding: 4px; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 6px; box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12); }
.ndt-menu { right: 0; top: 100%; margin-top: 2px; }
.ndt-ctx { position: fixed; pointer-events: auto; }
.ndt-menu button, .ndt-ctx button { text-align: left; background: none; border: 0; padding: 5px 8px; border-radius: 4px; cursor: pointer; }
.ndt-menu button:hover, .ndt-ctx button:hover { background: hsl(var(--muted)); }
.ndt-menu-check { display: flex; gap: 6px; align-items: center; padding: 5px 8px; cursor: pointer; border-top: 1px solid hsl(var(--border)); margin-top: 4px; }
.ndt-ctx-sep { height: 1px; background: hsl(var(--border)); margin: 4px 0; }
.ndt-toast { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 7; padding: 6px 10px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--background)); box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12); }
.ndt-toast:empty { display: none; }

/* ---------- body viewer ---------- */
.ndt-body { border: 1px solid hsl(var(--border)); border-radius: 6px; margin-top: 6px; overflow: hidden; outline: none; }
.ndt-body-bar { position: sticky; top: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 4px; background: hsl(var(--muted) / 0.6); border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-search { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-search .ndt-input { border-color: hsl(var(--border)); }
.ndt-note { padding: 4px 8px; color: hsl(var(--warning)); border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-scroll { max-height: 240px; overflow: auto; padding: 6px 8px; }
.ndt-body-scroll.is-expanded { max-height: none; }
.ndt-preview img { max-width: 100%; }
.ndt-iframe { width: 100%; height: 220px; border: 1px solid hsl(var(--border)); background: #fff; }
.ndt-raw { font-family: var(--font-mono); font-size: 11px; }
.ndt-raw-line { display: flex; gap: 8px; }
.ndt-ln { flex: none; min-width: 4ch; text-align: right; color: hsl(var(--muted-foreground)); user-select: none; }
.ndt-lt { white-space: pre; }
.ndt-raw.wrap .ndt-lt { white-space: pre-wrap; overflow-wrap: anywhere; }
mark { background: hsl(var(--warning) / 0.35); color: inherit; border-radius: 2px; }
mark.active { background: hsl(var(--warning) / 0.85); color: hsl(var(--background)); }

/* ---------- JSON tree ---------- */
.jt { font-family: var(--font-mono); font-size: 11px; line-height: 1.6; }
.jt-children { margin-left: 12px; padding-left: 8px; border-left: 1px solid hsl(var(--border)); }
.jt-line { display: flex; flex-wrap: wrap; align-items: baseline; position: relative; }
.jt-toggle { background: none; border: 0; padding: 0 4px 0 0; cursor: pointer; color: hsl(var(--muted-foreground)); width: 14px; }
.jt-key { color: hsl(var(--info)); }
.jt-punc { color: hsl(var(--muted-foreground)); white-space: pre; }
.jt-str { color: hsl(var(--success)); }
.jt-num { color: hsl(var(--warning)); }
.jt-lit { color: hsl(var(--destructive)); }
.jt-val { cursor: pointer; overflow-wrap: anywhere; }
.jt-preview { color: hsl(var(--muted-foreground)); cursor: pointer; }
.jt-copy { background: none; border: 0; padding: 0 4px; cursor: pointer; opacity: 0; color: hsl(var(--muted-foreground)); }
.jt-line:hover .jt-copy, .jt-copy:focus-visible { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

// src/client/shadow-wrapper.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
function useResolvedTheme(theme) {
  const [system, setSystem] = useState10("light");
  useEffect4(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystem(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return theme === "system" ? system : theme;
}
var ShadowWrapper = ({ theme, children }) => {
  const hostRef = useRef8(null);
  const [container, setContainer] = useState10(null);
  const resolved = useResolvedTheme(theme);
  useEffect4(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let box = root.getElementById("devtools-app-container");
    if (!box) {
      const style = document.createElement("style");
      style.textContent = DEVTOOLS_ISOLATED_CSS;
      root.appendChild(style);
      box = document.createElement("div");
      box.id = "devtools-app-container";
      box.className = "ndt-root";
      root.appendChild(box);
    }
    setContainer(box);
  }, []);
  return /* @__PURE__ */ jsx13(
    "div",
    {
      ref: hostRef,
      id: "__next_devtools_host",
      "data-theme": resolved,
      style: { position: "fixed", inset: 0, zIndex: 2147483e3, pointerEvents: "none" },
      children: container && createPortal(children, container)
    }
  );
};

// src/client/store.ts
import { useSyncExternalStore } from "react";

// src/shared/types.ts
function entryTimestamp(entry) {
  return entry.category === "network" ? entry.request.timestamp : entry.timestamp;
}

// src/client/storage.ts
var DB_NAME = "next_devtools_db";
var DB_VERSION = 1;
var SS_KEY = "next-devtools:entries";
var dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("entries", { keyPath: "id" });
        req.result.createObjectStore("settings");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}
function done(tx) {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}
function ssRead() {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) || "[]");
  } catch {
    return [];
  }
}
function ssWrite(entries) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(entries));
  } catch {
  }
}
async function loadEntries() {
  const db = await openDb();
  if (!db) return ssRead();
  const tx = db.transaction("entries", "readonly");
  const req = tx.objectStore("entries").getAll();
  await done(tx);
  return req.result || [];
}
async function saveEntry(entry) {
  const db = await openDb();
  if (!db) {
    const all = ssRead().filter((e) => e.id !== entry.id);
    all.push(entry);
    return ssWrite(all);
  }
  const tx = db.transaction("entries", "readwrite");
  tx.objectStore("entries").put(entry);
  await done(tx);
}
async function deleteEntries(ids) {
  if (!ids.length) return;
  const db = await openDb();
  if (!db) return ssWrite(ssRead().filter((e) => !ids.includes(e.id)));
  const tx = db.transaction("entries", "readwrite");
  for (const id of ids) tx.objectStore("entries").delete(id);
  await done(tx);
}
async function clearEntries() {
  const db = await openDb();
  if (!db) return ssWrite([]);
  const tx = db.transaction("entries", "readwrite");
  tx.objectStore("entries").clear();
  await done(tx);
}

// src/client/store.ts
function createStore() {
  let buffer = [];
  let state = { entries: [], system: null, sse: "idle" };
  let maxEntries = 200;
  let recording = true;
  let timer = null;
  const listeners = /* @__PURE__ */ new Set();
  let isHydrated = false;
  let hydratePromise = null;
  const flush = () => {
    timer = null;
    state = { ...state, entries: buffer.slice() };
    listeners.forEach((l) => l());
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 32);
  };
  const trim = () => {
    if (buffer.length <= maxEntries) return;
    const dropped = buffer.splice(0, buffer.length - maxEntries);
    void deleteEntries(dropped.map((e) => e.id));
  };
  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    configure(opts) {
      if (opts.maxEntries) maxEntries = opts.maxEntries;
      trim();
    },
    setRecording(on) {
      recording = on;
    },
    upsert(entry) {
      if (!recording) return;
      let i = buffer.length - 1;
      while (i >= 0 && buffer[i].id !== entry.id) i--;
      if (i >= 0) buffer[i] = entry;
      else buffer.push(entry);
      trim();
      void saveEntry(entry);
      schedule();
    },
    clear() {
      buffer = [];
      isHydrated = false;
      void clearEntries();
      flush();
    },
    setSystem(system) {
      state = { ...state, system };
      schedule();
    },
    setSse(sse) {
      state = { ...state, sse };
      schedule();
    },
    /** Restore entries persisted by a previous page load (IndexedDB / sessionStorage). */
    async hydrate() {
      if (isHydrated) return;
      if (hydratePromise) return hydratePromise;
      hydratePromise = (async () => {
        try {
          const stored = await loadEntries();
          const byId = /* @__PURE__ */ new Map();
          for (const item of stored) {
            const e = item.category === "network" && item.origin === "client" && item.state === "pending" ? { ...item, state: "failed", error: "Interrupted (page reloaded)" } : item;
            byId.set(e.id, e);
          }
          for (const item of buffer) {
            byId.set(item.id, item);
          }
          buffer = Array.from(byId.values()).sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
          trim();
          flush();
          isHydrated = true;
        } finally {
          hydratePromise = null;
        }
      })();
      return hydratePromise;
    }
  };
}
var KEY = /* @__PURE__ */ Symbol.for("next-devtools.store");
var g = globalThis;
var store = g[KEY] || (g[KEY] = createStore());
function useDevToolsState() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// src/client/sse-client.ts
var SSE_URL = "/api/next-devtools/sse";
function connectSse(url = SSE_URL) {
  if (typeof EventSource === "undefined") return () => {
  };
  store.setSse("connecting");
  const es = new EventSource(url);
  es.onopen = () => store.setSse("open");
  es.onmessage = (e) => {
    try {
      store.upsert(JSON.parse(e.data));
    } catch {
    }
  };
  es.addEventListener("system", (e) => {
    try {
      store.setSystem(JSON.parse(e.data));
    } catch {
    }
  });
  es.onerror = () => store.setSse(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
  return () => {
    es.close();
    store.setSse("idle");
  };
}

// src/client/dev-tools.tsx
import { jsx as jsx14, jsxs as jsxs11 } from "react/jsx-runtime";
if (typeof window !== "undefined") {
  setupClientFetchProxy(store.upsert);
}
var INSET = 16;
var PILL_H = 36;
var MIN_W = 340;
var MIN_H = 240;
var DEFAULT_SIZE = { w: 420, h: 360 };
var ALL_TABS = ["network", "actions", "cache", "system"];
function readSafeArea() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const box = {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0
  };
  el.remove();
  return box;
}
function matchHotkey(e, hotkey) {
  const parts = hotkey.toLowerCase().split("+").map((s) => s.trim());
  const key = parts.pop() ?? "";
  const mods = new Set(parts);
  if (e.altKey !== (mods.has("alt") || mods.has("option")) || e.ctrlKey !== (mods.has("ctrl") || mods.has("control")) || e.metaKey !== (mods.has("meta") || mods.has("cmd")) || e.shiftKey !== mods.has("shift")) {
    return false;
  }
  return e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}`;
}
var clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
function NextDevTools({
  position = "bottom-right",
  theme = "system",
  defaultOpen = false,
  hotkey = "alt+d",
  maxEntries = 200,
  redact = DEFAULT_REDACT,
  tabs = ALL_TABS,
  enabled = process.env.NODE_ENV === "development" || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true"
}) {
  const [mounted, setMounted] = useState11(false);
  useEffect5(() => setMounted(true), []);
  useEffect5(() => {
    if (typeof window !== "undefined") setupClientFetchProxy(store.upsert);
    store.setRecording(enabled);
  }, [enabled]);
  if (!enabled || !mounted) return null;
  return /* @__PURE__ */ jsx14(ShadowWrapper, { theme, children: /* @__PURE__ */ jsx14(DevToolsApp, { position, defaultOpen, hotkey, maxEntries, redact, tabs }) });
}
function DevToolsApp({ position, defaultOpen, hotkey, maxEntries, redact, tabs }) {
  const { entries, system, sse } = useDevToolsState();
  const [open, setOpen] = useState11(defaultOpen);
  const [maximized, setMaximized] = useState11(false);
  const [hidden, setHidden] = useState11(() => {
    try {
      return sessionStorage.getItem("next-devtools:hidden") === "1";
    } catch {
      return false;
    }
  });
  const [corner, setCorner] = useLocalStorage("next-devtools:position", position);
  const [size, saveSize] = useLocalStorage("next-devtools:size", DEFAULT_SIZE);
  const [waterfall, setWaterfall] = useLocalStorage("next-devtools:waterfall", false);
  const [liveSize, setLiveSize] = useState11(null);
  const visibleTabs = tabs.length ? tabs : ALL_TABS;
  const [tab, setTab] = useState11(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  useEffect5(() => {
    store.configure({ maxEntries });
  }, [maxEntries]);
  useEffect5(() => {
    void store.hydrate();
    const unsubSsr = setupSsrObserver(store.upsert);
    const unsubSse = connectSse();
    return () => {
      unsubSsr();
      unsubSse();
    };
  }, []);
  useEffect5(() => {
    drainTraceCookies(store.upsert);
    const interval = setInterval(() => drainTraceCookies(store.upsert), 1e3);
    const onFocus = () => drainTraceCookies(store.upsert);
    const onVisibility = () => {
      if (document.visibilityState === "visible") drainTraceCookies(store.upsert);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const counts = useMemo4(() => {
    let total = 0, errors = 0, pending = 0;
    for (const e of entries) {
      if (e.category !== "network") continue;
      total++;
      if (e.state === "pending") pending++;
      if (e.state === "failed" || e.response && e.response.status >= 400) errors++;
    }
    return { total, errors, pending };
  }, [entries]);
  const [vp, setVp] = useState11({ w: 1024, h: 768 });
  const [safe, setSafe] = useState11({ t: 0, r: 0, b: 0, l: 0 });
  const [pillW, setPillW] = useState11(36);
  const [animate, setAnimate] = useState11(false);
  const pillRef = useRef9(null);
  const panelRef = useRef9(null);
  useEffect5(() => {
    const sync = () => {
      setVp({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
      setSafe(readSafeArea());
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const t = setTimeout(() => setAnimate(true), 100);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      clearTimeout(t);
    };
  }, []);
  useLayoutEffect2(() => {
    const w = pillRef.current?.offsetWidth;
    if (w && w !== pillW) setPillW(w);
  }, [counts.total, counts.errors, hidden, pillW]);
  const cornerXY = useCallback3(
    (c) => ({
      x: c.endsWith("left") ? INSET + safe.l : vp.w - pillW - INSET - safe.r,
      y: c.startsWith("top") ? INSET + safe.t : vp.h - PILL_H - INSET - safe.b
    }),
    [vp, safe, pillW]
  );
  const [drag, setDrag] = useState11(null);
  const dragRef = useRef9(null);
  const suppressClick = useRef9(false);
  const longPress = useRef9(void 0);
  const [menu, setMenu] = useState11(null);
  const pos = drag ?? cornerXY(corner);
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    if (e.pointerType === "touch") {
      const { clientX: x, clientY: y } = e;
      longPress.current = setTimeout(() => {
        if (!dragRef.current?.moved) {
          suppressClick.current = true;
          setMenu({ x, y });
        }
      }, 550);
    }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    clearTimeout(longPress.current);
    setDrag({ x: clamp(d.ox + dx, 0, vp.w - pillW), y: clamp(d.oy + dy, 0, vp.h - PILL_H) });
  };
  const onPointerUp = (e) => {
    clearTimeout(longPress.current);
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved || !drag) return;
    suppressClick.current = true;
    const cx = drag.x + pillW / 2;
    const cy = drag.y + PILL_H / 2;
    setCorner(`${cy < vp.h / 2 ? "top" : "bottom"}-${cx < vp.w / 2 ? "left" : "right"}`);
    setDrag(null);
  };
  const toggle = useCallback3(() => {
    setHidden(false);
    try {
      sessionStorage.removeItem("next-devtools:hidden");
    } catch {
    }
    setOpen((o) => !o);
  }, []);
  const close = useCallback3(() => {
    setOpen(false);
    pillRef.current?.focus();
  }, []);
  useEffect5(() => {
    const onKey = (e) => {
      if (matchHotkey(e, hotkey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hotkey, toggle]);
  useEffect5(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect5(() => {
    if (!menu) return;
    const away = (e) => {
      if (!e.composedPath().some((n) => n.classList?.contains("ndt-ctx"))) setMenu(null);
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [menu]);
  const maxW = vp.w * 0.9;
  const maxH = vp.h * 0.8;
  const cur = liveSize ?? size;
  const width = maximized ? maxW : Math.min(maxW, Math.max(MIN_W, cur.w));
  const height = maximized ? maxH : Math.min(maxH, Math.max(MIN_H, cur.h));
  const panelStyle = {
    width,
    height,
    ...corner.startsWith("top") ? { top: INSET + safe.t + PILL_H + 8 } : { bottom: INSET + safe.b + PILL_H + 8 },
    ...corner.endsWith("left") ? { left: INSET + safe.l } : { right: INSET + safe.r }
  };
  const resize = useRef9(null);
  const onResizeStart = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { sx: e.clientX, sy: e.clientY, w: width, h: height };
  };
  const onResizeMove = (e) => {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    setLiveSize({
      w: Math.round(clamp(r.w + (corner.endsWith("right") ? -dx : dx), MIN_W, maxW)),
      h: Math.round(clamp(r.h + (corner.startsWith("bottom") ? -dy : dy), MIN_H, maxH))
    });
  };
  const onResizeEnd = (e) => {
    if (!resize.current) return;
    resize.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (liveSize) saveSize(liveSize);
    setLiveSize(null);
  };
  if (hidden) return null;
  return /* @__PURE__ */ jsxs11(RedactContext.Provider, { value: redact, children: [
    /* @__PURE__ */ jsx14(
      TriggerButton,
      {
        innerRef: pillRef,
        total: counts.total,
        errors: counts.errors,
        pending: counts.pending,
        x: pos.x,
        y: pos.y,
        open,
        dragging: !!drag,
        animate,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onClick: () => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          toggle();
        },
        onContextMenu: (e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }
      }
    ),
    open && /* @__PURE__ */ jsx14(
      Drawer,
      {
        corner,
        style: panelStyle,
        tabs: visibleTabs,
        active: activeTab,
        maximized,
        innerRef: panelRef,
        onTab: setTab,
        onClose: close,
        onToggleMaximize: () => setMaximized((m) => !m),
        onResizeStart,
        onResizeMove,
        onResizeEnd,
        children: /* @__PURE__ */ jsxs11(CopyProvider, { children: [
          activeTab === "network" && /* @__PURE__ */ jsx14(NetworkTab, { entries, maximized, waterfall, onClear: store.clear }),
          activeTab === "actions" && /* @__PURE__ */ jsx14(ActionsTab, { entries, onClear: store.clear }),
          activeTab === "cache" && /* @__PURE__ */ jsx14(CacheTab, { entries, onClear: store.clear }),
          activeTab === "system" && /* @__PURE__ */ jsx14(SystemTab, { system, sse })
        ] })
      }
    ),
    menu && /* @__PURE__ */ jsxs11(
      "div",
      {
        className: "ndt-ctx",
        role: "menu",
        style: { left: clamp(menu.x, 0, vp.w - 200), top: clamp(menu.y, 0, vp.h - 200) },
        children: [
          ["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => /* @__PURE__ */ jsxs11("button", { type: "button", role: "menuitem", onClick: () => {
            setCorner(c);
            setMenu(null);
          }, children: [
            "Move to ",
            c.replace("-", " ")
          ] }, c)),
          /* @__PURE__ */ jsx14("div", { className: "ndt-ctx-sep" }),
          /* @__PURE__ */ jsxs11("button", { type: "button", role: "menuitem", onClick: () => {
            setWaterfall(!waterfall);
            setMenu(null);
          }, children: [
            waterfall ? "Hide" : "Show",
            " waterfall bars"
          ] }),
          /* @__PURE__ */ jsx14("button", { type: "button", role: "menuitem", onClick: () => {
            store.clear();
            setMenu(null);
          }, children: "Clear all" }),
          /* @__PURE__ */ jsx14(
            "button",
            {
              type: "button",
              role: "menuitem",
              onClick: () => {
                try {
                  sessionStorage.setItem("next-devtools:hidden", "1");
                } catch {
                }
                setOpen(false);
                setHidden(true);
                setMenu(null);
              },
              children: "Hide for this session"
            }
          )
        ]
      }
    )
  ] });
}
export {
  NextDevTools,
  NextDevTools as NextDevToolsClient,
  drainSsrTraces,
  drainTraceCookies,
  setupSsrObserver
};
//# sourceMappingURL=client.mjs.map