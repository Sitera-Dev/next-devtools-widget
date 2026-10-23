import type { SystemInfo } from '../shared/types';

let nextVersion: string | undefined;

async function resolveNextVersion(): Promise<string> {
  if (nextVersion) return nextVersion;
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(`${process.cwd()}/noop.js`);
    nextVersion = (req('next/package.json') as { version: string }).version;
  } catch {
    nextVersion = 'unknown';
  }
  return nextVersion;
}

/** Built on demand for each SSE connection; nothing is retained. */
export async function getSystemInfo(): Promise<SystemInfo> {
  const mem = process.memoryUsage();
  return {
    runtime: process.env.NEXT_RUNTIME || 'nodejs',
    nodeVersion: process.version,
    nextVersion: await resolveNextVersion(),
    nodeEnv: process.env.NODE_ENV || 'unknown',
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external },
    updatedAt: Date.now(),
  };
}
