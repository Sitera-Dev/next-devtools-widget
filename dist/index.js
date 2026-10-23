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

// src/index.tsx
var src_exports = {};
__export(src_exports, {
  NextDevTools: () => NextDevTools,
  NextDevToolsClient: () => import_client.NextDevToolsClient,
  drainSsrTraces: () => import_client2.drainSsrTraces,
  drainTraceCookies: () => import_client2.drainTraceCookies,
  setupSsrObserver: () => import_client2.setupSsrObserver
});
module.exports = __toCommonJS(src_exports);
var import_react = require("react");
var import_client = require("./client.js");

// src/server/ssr-store.ts
var SSR_STORE_KEY = /* @__PURE__ */ Symbol.for("next-devtools.ssr-store");
var g = globalThis;
function getStore() {
  return g[SSR_STORE_KEY] || (g[SSR_STORE_KEY] = {
    buffer: [],
    inFlight: /* @__PURE__ */ new Set()
  });
}
async function waitForSsrTraces(timeoutMs = 1500) {
  const s = getStore();
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (s.inFlight.size === 0) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (s.inFlight.size === 0) {
        break;
      }
    }
    await Promise.race([
      Promise.all(Array.from(s.inFlight)),
      new Promise((resolve) => setTimeout(resolve, 25))
    ]);
  }
  const traces = s.buffer.slice();
  s.buffer.length = 0;
  return traces;
}

// src/index.tsx
var import_client2 = require("./client.js");
var import_jsx_runtime = require("react/jsx-runtime");
async function SsrCollector(props) {
  let tracesPayload = "";
  if (typeof window === "undefined") {
    try {
      let isCleared = false;
      try {
        const nextHeaders = await import("next/headers");
        if (nextHeaders && typeof nextHeaders.cookies === "function") {
          const cookieJar = await Promise.resolve(nextHeaders.cookies());
          if (cookieJar && cookieJar.get("__ndt_clear")?.value === "1") {
            isCleared = true;
          }
        }
      } catch {
      }
      const traces = await waitForSsrTraces(1500);
      if (!isCleared && traces && traces.length > 0) {
        tracesPayload = JSON.stringify(traces).replace(/</g, "\\u003c");
      }
    } catch {
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    tracesPayload ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "script",
      {
        type: "application/json",
        id: "__next_devtools_ssr__",
        "data-next-devtools-ssr": "",
        dangerouslySetInnerHTML: { __html: tracesPayload }
      }
    ) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_client.NextDevToolsClient, { ...props })
  ] });
}
function NextDevTools(props) {
  const isEnabled = props.enabled ?? (process.env.NODE_ENV === "development" || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true");
  if (!isEnabled) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, { fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_client.NextDevToolsClient, { ...props }), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SsrCollector, { ...props }) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NextDevTools,
  NextDevToolsClient,
  drainSsrTraces,
  drainTraceCookies,
  setupSsrObserver
});
//# sourceMappingURL=index.js.map