"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
  return s.buffer.slice();
}

// src/index.tsx
var import_client2 = require("./client.js");
var import_jsx_runtime = require("react/jsx-runtime");
async function NextDevTools({
  children,
  ...props
}) {
  const isEnabled = props.enabled ?? (process.env.NODE_ENV === "development" || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true");
  if (!isEnabled) {
    return children ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children }) : null;
  }
  let tracesPayload = "";
  if (typeof window === "undefined") {
    try {
      const traces = await waitForSsrTraces(1500);
      if (traces && traces.length > 0) {
        tracesPayload = JSON.stringify(traces).replace(/</g, "\\u003c");
      }
    } catch {
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    children,
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NextDevTools,
  NextDevToolsClient,
  drainSsrTraces,
  drainTraceCookies,
  setupSsrObserver
});
//# sourceMappingURL=index.js.map