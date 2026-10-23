import React, { useRef, useState } from 'react';
import type { ActionEntry, DevToolsEntry } from '../../../shared/types';
import { formatDuration } from '../../../shared/utils';
import { JsonTree } from '../json-tree';
import { Accordion, IconArrowLeft, IconTrash, useRedact } from '../ui';
import { VirtualList } from '../virtual-list';

export function ValueView({ value }: { value: unknown }) {
  const rules = useRedact();
  if (value !== null && typeof value === 'object') {
    return <JsonTree value={value} query="" level={2} epoch={0} rules={rules} />;
  }
  if (value === undefined) return <div className="ndt-muted">undefined</div>;
  return <pre className="ndt-code">{typeof value === 'string' ? value : JSON.stringify(value)}</pre>;
}

export function ActionsTab({ entries, onClear }: { entries: DevToolsEntry[]; onClear: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollMemory = useRef(0);

  const actions: ActionEntry[] = [];
  const seenIds = new Set<string>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    if (e.category === 'action') actions.push(e);
  }
  const selected = actions.find((a) => a.id === selectedId);

  if (selected) {
    return (
      <div className="ndt-tab" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSelectedId(null); } }}>
        <div className="ndt-detail">
          <div className="ndt-detail-head">
            <button type="button" className="ndt-btn" onClick={() => setSelectedId(null)}><IconArrowLeft /> Back</button>
            <span className="ndt-detail-title">{selected.actionName}</span>
          </div>
          <div className="ndt-summary">
            {selected.error ? '✗ Failed' : '✓ OK'} · {formatDuration(selected.durationMs)} · {selected.origin === 'client' ? 'Client' : 'Server'} ·{' '}
            {new Date(selected.timestamp).toLocaleTimeString()}
          </div>
          <div className="ndt-detail-body">
            <Accordion title="Arguments" count={selected.args.length} defaultOpen>
              <ValueView value={selected.args} />
            </Accordion>
            {selected.error ? (
              <Accordion title="Error" defaultOpen>
                <pre className="ndt-code tone-destructive-text">{selected.error}</pre>
              </Accordion>
            ) : (
              <Accordion title="Result" defaultOpen>
                <ValueView value={selected.result} />
              </Accordion>
            )}
            {selected.errorStack && (
              <Accordion title="Stack trace">
                <pre className="ndt-code">{selected.errorStack}</pre>
              </Accordion>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ndt-tab" tabIndex={-1}>
      <div className="ndt-toolbar">
        <span className="ndt-muted">{actions.length} invocation{actions.length === 1 ? '' : 's'}</span>
        <span className="ndt-spacer" />
        <button type="button" className="ndt-icon-btn" aria-label="Clear all" title="Clear all" onClick={onClear}><IconTrash /></button>
      </div>
      <VirtualList
        items={actions}
        rowHeight={28}
        scrollMemory={scrollMemory}
        empty="No Server Actions yet. Invocations will appear here."
        renderRow={(a) => (
          <div role="option" aria-selected={false} className="ndt-row ndt-row-simple" onClick={() => setSelectedId(a.id)}>
            <span className="ndt-row-path ndt-mono" title={a.actionName}>{a.actionName}</span>
            <span className="ndt-row-num ndt-tnum">{formatDuration(a.durationMs)}</span>
            <span className={`ndt-status ${a.error ? 'tone-destructive' : 'tone-success'}`}>{a.error ? '✗ ERR' : '✓ OK'}</span>
          </div>
        )}
      />
    </div>
  );
}
