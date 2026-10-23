import React, { useRef, useState } from 'react';
import type { CacheEntry, DevToolsEntry } from '../../../shared/types';
import { IconArrowLeft, IconTrash } from '../ui';
import { VirtualList } from '../virtual-list';

const tone = (s: CacheEntry['status']) => (s === 'HIT' ? 'success' : s === 'MISS' ? 'warning' : s === 'STALE' ? 'info' : 'muted');

export function CacheTab({ entries, onClear }: { entries: DevToolsEntry[]; onClear: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollMemory = useRef(0);

  const items: CacheEntry[] = [];
  const seenIds = new Set<string>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    if (e.category === 'cache') items.push(e);
  }
  const selected = items.find((c) => c.id === selectedId);

  if (selected) {
    const timeline = items.filter((c) => c.key === selected.key).sort((a, b) => a.timestamp - b.timestamp);
    return (
      <div className="ndt-tab" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSelectedId(null); } }}>
        <div className="ndt-detail">
          <div className="ndt-detail-head">
            <button type="button" className="ndt-btn" onClick={() => setSelectedId(null)}><IconArrowLeft /> Back</button>
            <span className="ndt-detail-title" title={selected.key}>{selected.key}</span>
          </div>
          <div className="ndt-summary">
            <span className={`ndt-status tone-${tone(selected.status)}`}>{selected.status}</span>
            {selected.revalidate !== undefined && <> · revalidate: {String(selected.revalidate)}</>}
          </div>
          <div className="ndt-detail-body">
            <h4 className="ndt-h">Tags</h4>
            <div className="ndt-chips">
              {selected.tags.length ? selected.tags.map((t) => <span className="ndt-chip" key={t}>{t}</span>) : <span className="ndt-muted">No tags</span>}
            </div>
            <h4 className="ndt-h">Timeline ({timeline.length})</h4>
            <ul className="ndt-timeline">
              {timeline.map((c) => (
                <li key={c.id}>
                  <span className="ndt-tnum ndt-muted">{new Date(c.timestamp).toLocaleTimeString()}</span>
                  <span className={`ndt-status tone-${tone(c.status)}`}>{c.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ndt-tab" tabIndex={-1}>
      <div className="ndt-toolbar">
        <span className="ndt-muted">{items.length} cache event{items.length === 1 ? '' : 's'}</span>
        <span className="ndt-spacer" />
        <button type="button" className="ndt-icon-btn" aria-label="Clear all" title="Clear all" onClick={onClear}><IconTrash /></button>
      </div>
      <VirtualList
        items={items}
        rowHeight={28}
        scrollMemory={scrollMemory}
        empty="No cache activity yet. fetch() calls with next.tags / revalidate appear here."
        renderRow={(c) => (
          <div role="option" aria-selected={false} className="ndt-row ndt-row-simple" onClick={() => setSelectedId(c.id)}>
            <span className="ndt-row-path ndt-mono" title={c.key}>{c.key}</span>
            <span className={`ndt-status tone-${tone(c.status)}`}>{c.status}</span>
          </div>
        )}
      />
    </div>
  );
}
