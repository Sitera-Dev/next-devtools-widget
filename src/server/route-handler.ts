import { broadcaster } from './event-broadcaster';
import { getSystemInfo } from './system-info';

// In your app: app/api/next-devtools/sse/route.ts
//   export { GET } from 'next-devtools-widget/server/route';

export async function GET(request: Request): Promise<Response> {
  // Streams request/response bodies, so it must never be reachable in production by accident.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_DEVTOOLS_ENABLED !== 'true') {
    return new Response('Not Found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let sysTimer: ReturnType<typeof setInterval> | undefined;

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearInterval(sysTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // client went away mid-write
        }
      };

      const sendSystem = () => {
        getSystemInfo().then(
          (info) => send(`event: system\ndata: ${JSON.stringify(info)}\n\n`),
          () => {},
        );
      };

      send(': connected\n\n');
      sendSystem();
      unsubscribe = broadcaster.subscribe((entry) => send(`data: ${JSON.stringify(entry)}\n\n`));
      heartbeat = setInterval(() => send(': ping\n\n'), 15_000);
      sysTimer = setInterval(sendSystem, 5_000);
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
