import React from 'react';
import { IconButton, IconLogo, IconMaximize, IconMinimize, IconX } from './ui';

export type TabId = 'network' | 'actions' | 'cache' | 'system';
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const LABELS: Record<TabId, string> = { network: 'Network', actions: 'Actions', cache: 'Cache', system: 'System' };

// The resize grip sits on the corner opposite to the one the panel is anchored to.
const GRIP: Record<Corner, string> = {
  'bottom-right': 'grip-tl',
  'bottom-left': 'grip-tr',
  'top-right': 'grip-bl',
  'top-left': 'grip-br',
};

interface Props {
  corner: Corner;
  style: React.CSSProperties;
  tabs: TabId[];
  active: TabId;
  maximized: boolean;
  innerRef: React.Ref<HTMLDivElement>;
  onTab: (t: TabId) => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

/** Compact slide-over panel with underline tabs. Esc closes (tabs consume Esc first when they can go "back"). */
export function Drawer(p: Props) {
  return (
    <div
      ref={p.innerRef}
      className="ndt-panel"
      style={p.style}
      role="dialog"
      aria-label="Next DevTools"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') p.onClose();
      }}
    >
      {!p.maximized && (
        <div
          className={`ndt-grip ${GRIP[p.corner]}`}
          aria-hidden="true"
          onPointerDown={p.onResizeStart}
          onPointerMove={p.onResizeMove}
          onPointerUp={p.onResizeEnd}
          onPointerCancel={p.onResizeEnd}
        />
      )}
      <div className="ndt-header">
        <div className="ndt-brand" title="Next DevTools">
          <IconLogo size={16} />
        </div>
        <div className="ndt-tabs" role="tablist" aria-label="DevTools sections">
          {p.tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={p.active === t} onClick={() => p.onTab(t)}>
              {LABELS[t]}
            </button>
          ))}
        </div>
        <div className="ndt-header-actions">
          <IconButton label={p.maximized ? 'Restore size' : 'Maximize'} onClick={p.onToggleMaximize}>
            {p.maximized ? <IconMinimize /> : <IconMaximize />}
          </IconButton>
          <IconButton label="Close" onClick={p.onClose}>
            <IconX />
          </IconButton>
        </div>
      </div>
      <div className="ndt-main" role="tabpanel">{p.children}</div>
    </div>
  );
}
