import React, { useMemo, useRef, useState } from 'react';
import type { DevToolsEntry, NetworkEntry } from '../../../shared/types';
import { formatBytes, formatDuration } from '../../../shared/utils';
import { useCopy } from '../copy-actions';
import { DetailView, MethodBadge, splitUrl, StatusBadge } from '../detail-view';
import { IconSearch, IconTrash } from '../ui';
import { VirtualList } from '../virtual-list';

const ROW_HEIGHT = 28;

type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'failed';
type OriginFilter = 'all' | 'server' | 'client';

function matchesStatus(e: NetworkEntry, f: StatusFilter): boolean {
  if (f === 'all') return true;
  if (f === 'failed') return e.state === 'failed' || (e.state === 'completed' && !e.response?.status);
  const s = e.response?.status ?? 0;
  return s >= Number(f[0]) * 100 && s < Number(f[0]) * 100 + 100;
}

interface Props {
  entries: DevToolsEntry[];
  maximized: boolean;
  waterfall: boolean;
  onClear: () => void;
}

export function NetworkTab({ entries, maximized, waterfall, onClear }: Props) {
  const { copy } = useCopy();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollMemory = useRef(0);

  // Newest first keeps fresh traffic visible in the tiny default panel.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: NetworkEntry[] = [];
    const seenIds = new Set<string>();
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      if (e.category !== 'network') continue;
      if (origin !== 'all' && e.origin !== origin) continue;
      if (!matchesStatus(e, status)) continue;
      if (q && !`${e.request.method} ${e.request.url} ${e.response?.status ?? ''}`.toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out;
  }, [entries, query, status, origin]);

  const maxDuration = useMemo(() => filtered.reduce((m, e) => Math.max(m, e.response?.durationMs ?? 0), 1), [filtered]);
  const selectedIndex = filtered.findIndex((e) => e.id === selectedId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const showDetail = selected && (maximized || detailOpen);

  const move = (delta: number) => {
    if (!filtered.length) return;
    const next = Math.min(filtered.length - 1, Math.max(0, (selectedIndex < 0 ? (delta > 0 ? -1 : 0) : selectedIndex) + delta));
    setSelectedId(filtered[next].id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Escape' && (tag === 'INPUT' || tag === 'SELECT')) {
      (e.target as HTMLElement).blur();
      e.stopPropagation();
      return;
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!showDetail || maximized) move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!showDetail || maximized) move(-1);
        break;
      case 'Enter':
        if (selected) setDetailOpen(true);
        break;
      case 'Escape':
        if (detailOpen) {
          setDetailOpen(false);
          e.stopPropagation(); // back first, close on the next Esc
        }
        break;
      case '/':
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case 'c':
      case 'C':
        if (selected) void copy(selected, 'curl');
        break;
    }
  };

  const list = (
    <VirtualList
      items={filtered}
      rowHeight={ROW_HEIGHT}
      selectedIndex={selectedIndex}
      scrollMemory={scrollMemory}
      empty="No requests yet. API calls will appear here."
      renderRow={(e) => {
        const { host, path, query: qs } = splitUrl(e.request.url);
        const dur = e.response?.durationMs;
        return (
          <div
            role="option"
            aria-selected={e.id === selectedId}
            className={`ndt-row ${e.id === selectedId ? 'is-selected' : ''}`}
            onClick={() => {
              setSelectedId(e.id);
              setDetailOpen(true);
            }}
          >
            <MethodBadge method={e.request.method} />
            <span className="ndt-row-path ndt-mono" title={e.request.url}>
              {e.origin === 'server' && <span className="ndt-origin" title="Server-side request">S</span>}
              {host}
              {path}
              <span className="ndt-muted">{qs}</span>
            </span>
            <StatusBadge entry={e} />
            <span className="ndt-row-num ndt-tnum">{formatDuration(dur)}</span>
            <span className="ndt-row-num ndt-tnum">{formatBytes(e.response?.size)}</span>
            <button
              type="button"
              className="ndt-row-copy"
              aria-label="Copy cURL"
              title="Copy cURL"
              onClick={(ev) => {
                ev.stopPropagation();
                void copy(e, 'curl');
              }}
            >
              cURL
            </button>
            {waterfall && dur != null && <span className="ndt-wf" style={{ width: `${Math.max((dur / maxDuration) * 100, 1)}%` }} />}
          </div>
        );
      }}
    />
  );

  const toolbar = (
    <div className="ndt-toolbar">
      <label className="ndt-search">
        <IconSearch />
        <input ref={searchRef} className="ndt-input" placeholder="Filter…" aria-label="Filter requests" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <select className="ndt-select" aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
        <option value="all">All</option>
        <option value="2xx">2xx</option>
        <option value="3xx">3xx</option>
        <option value="4xx">4xx</option>
        <option value="5xx">5xx</option>
        <option value="failed">Failed</option>
      </select>
      <div className="ndt-seg" role="group" aria-label="Origin filter">
        {(['all', 'server', 'client'] as OriginFilter[]).map((o) => (
          <button key={o} type="button" aria-pressed={origin === o} onClick={() => setOrigin(o)}>
            {o === 'all' ? 'All' : o === 'server' ? 'Server' : 'Client'}
          </button>
        ))}
      </div>
      <button type="button" className="ndt-icon-btn" aria-label="Clear all" title="Clear all" onClick={onClear}>
        <IconTrash />
      </button>
    </div>
  );

  if (maximized) {
    return (
      <div className="ndt-tab" tabIndex={-1} onKeyDown={onKeyDown}>
        {toolbar}
        <div className="ndt-split-pane">
          <div className="ndt-pane-list">{list}</div>
          <div className="ndt-pane-detail">
            {selected ? <DetailView key={selected.id} entry={selected} onBack={() => setSelectedId(null)} /> : <div className="ndt-empty">Select a request to inspect it.</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ndt-tab" tabIndex={-1} onKeyDown={onKeyDown}>
      {showDetail ? (
        <DetailView key={selected.id} entry={selected} onBack={() => setDetailOpen(false)} />
      ) : (
        <>
          {toolbar}
          {list}
        </>
      )}
    </div>
  );
}
