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

// src/server/route-handler.ts
var route_handler_exports = {};
__export(route_handler_exports, {
  GET: () => GET
});
module.exports = __toCommonJS(route_handler_exports);

// src/server/event-broadcaster.ts
var KEY = /* @__PURE__ */ Symbol.for("next-devtools.broadcaster");
var g = globalThis;
var state = g[KEY] || (g[KEY] = { listeners: /* @__PURE__ */ new Set() });
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

// src/server/system-info.ts
var nextVersion;
async function resolveNextVersion() {
  if (nextVersion) return nextVersion;
  try {
    const { createRequire } = await import("module");
    const req = createRequire(`${process.cwd()}/noop.js`);
    nextVersion = req("next/package.json").version;
  } catch {
    nextVersion = "unknown";
  }
  return nextVersion;
}
async function getSystemInfo() {
  const mem = process.memoryUsage();
  return {
    runtime: process.env.NEXT_RUNTIME || "nodejs",
    nodeVersion: process.version,
    nextVersion: await resolveNextVersion(),
    nodeEnv: process.env.NODE_ENV || "unknown",
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
    updatedAt: Date.now()
  };
}

// src/server/route-handler.ts
async function GET(request) {
  const isAllowedInProd = process.env.NEXT_DEVTOOLS_ENABLED === "true" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true";
  if (process.env.NODE_ENV === "production" && !isAllowedInProd) {
    return new Response("Not Found", { status: 404 });
  }
  const encoder = new TextEncoder();
  let cleanup = () => {
  };
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {
      };
      let heartbeat;
      let sysTimer;
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(sysTimer);
        try {
          controller.close();
        } catch {
        }
      };
      const send = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const sendSystem = () => {
        getSystemInfo().then(
          (info) => send(`event: system
data: ${JSON.stringify(info)}

`),
          () => {
          }
        );
      };
      send(": connected\n\n");
      sendSystem();
      unsubscribe = broadcaster.subscribe((entry) => send(`data: ${JSON.stringify(entry)}

`));
      heartbeat = setInterval(() => send(": ping\n\n"), 15e3);
      sysTimer = setInterval(sendSystem, 5e3);
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GET
});
//# sourceMappingURL=route.js.map