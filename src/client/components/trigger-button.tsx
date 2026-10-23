import React from 'react';
import { IconLogo } from './ui';

interface Props {
  total: number;
  errors: number;
  pending: number;
  x: number;
  y: number;
  open: boolean;
  dragging: boolean;
  animate: boolean;
  innerRef: React.Ref<HTMLButtonElement>;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** Floating widget button: clean minimal logo button. */
export function TriggerButton(p: Props) {
  return (
    <button
      ref={p.innerRef}
      type="button"
      id="next-devtools-trigger"
      className={`ndt-pill ${p.open ? 'is-open' : ''} ${p.dragging ? 'is-dragging' : ''} ${p.animate ? '' : 'no-anim'}`}
      style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
      aria-label="Next DevTools"
      aria-expanded={p.open}
      aria-haspopup="dialog"
      onPointerDown={p.onPointerDown}
      onPointerMove={p.onPointerMove}
      onPointerUp={p.onPointerUp}
      onPointerCancel={p.onPointerUp}
      onClick={p.onClick}
      onContextMenu={p.onContextMenu}
    >
      <IconLogo size={18} />
    </button>
  );
}
