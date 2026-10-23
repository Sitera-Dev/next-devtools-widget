// src/index.tsx
import { Suspense } from "react";
import {
  NextDevToolsClient
} from "./client.mjs";

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
  return s.buffer.slice();
}

// src/index.tsx
import {
  drainTraceCookies,
  drainSsrTraces,
  setupSsrObserver
} from "./client.mjs";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
async function SsrCollector(props) {
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
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    tracesPayload ? /* @__PURE__ */ jsx(
      "script",
      {
        type: "application/json",
        id: "__next_devtools_ssr__",
        "data-next-devtools-ssr": "",
        dangerouslySetInnerHTML: { __html: tracesPayload }
      }
    ) : null,
    /* @__PURE__ */ jsx(NextDevToolsClient, { ...props })
  ] });
}
function NextDevTools(props) {
  const isEnabled = props.enabled ?? (process.env.NODE_ENV === "development" || process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true");
  if (!isEnabled) return null;
  return /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(NextDevToolsClient, { ...props }), children: /* @__PURE__ */ jsx(SsrCollector, { ...props }) });
}
export {
  NextDevTools,
  NextDevToolsClient,
  drainSsrTraces,
  drainTraceCookies,
  setupSsrObserver
};
//# sourceMappingURL=index.mjs.map