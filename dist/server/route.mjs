import {
  broadcaster
} from "../chunk-USJWC5NF.mjs";

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
export {
  GET
};
//# sourceMappingURL=route.mjs.map