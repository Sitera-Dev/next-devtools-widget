import React from 'react';
import type { SystemInfo } from '../../../shared/types';
import { formatBytes } from '../../../shared/utils';
import type { SseStatus } from '../../store';
import { KV } from '../ui';

function Group({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) {
  return (
    <section className="ndt-group">
      <h4 className="ndt-h">{title}</h4>
      <KV rows={rows} />
    </section>
  );
}

const SSE_LABEL: Record<SseStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Disconnected — is app/api/next-devtools/sse/route.ts mounted? (run npx next-devtools-widget init)',
};

export function SystemTab({ system, sse }: { system: SystemInfo | null; sse: SseStatus }) {
  const mem = system?.memory;
  const pct = mem ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0;

  return (
    <div className="ndt-tab ndt-scroll" tabIndex={-1}>
      <Group title="Connection" rows={[['Server stream (SSE)', <span key="s" className={`ndt-status tone-${sse === 'open' ? 'success' : sse === 'closed' ? 'destructive' : 'muted'}`}>{SSE_LABEL[sse]}</span>]]} />
      {!system ? (
        <div className="ndt-empty-inline">Waiting for server diagnostics…</div>
      ) : (
        <>
          <Group
            title="Runtime"
            rows={[
              ['Runtime', system.runtime],
              ['Node.js', system.nodeVersion],
              ['Platform', `${system.platform} · ${system.arch}`],
              ['PID', String(system.pid)],
              ['Uptime', `${system.uptimeSec}s`],
            ]}
          />
          <Group title="Next.js" rows={[['Version', system.nextVersion], ['NODE_ENV', system.nodeEnv]]} />
          <Group
            title="Memory"
            rows={[
              ['Heap', <span key="h" className="ndt-mem"><span className="ndt-mem-bar"><span style={{ width: `${pct}%` }} /></span>{formatBytes(mem!.heapUsed)} / {formatBytes(mem!.heapTotal)}</span>],
              ['RSS', formatBytes(mem!.rss)],
              ['External', formatBytes(mem!.external)],
            ]}
          />
        </>
      )}
    </div>
  );
}
