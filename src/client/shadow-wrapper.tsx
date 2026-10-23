import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEVTOOLS_ISOLATED_CSS } from './styles';

export type Theme = 'light' | 'dark' | 'system';

function useResolvedTheme(theme: Theme): 'light' | 'dark' {
  const [system, setSystem] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystem(mq.matches ? 'dark' : 'light');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return theme === 'system' ? system : theme;
}

/** Renders children inside an isolated Shadow DOM root so host CSS can never touch the widget. */
export const ShadowWrapper: React.FC<{ theme: Theme; children: React.ReactNode }> = ({ theme, children }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const resolved = useResolvedTheme(theme);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    let box = root.getElementById('devtools-app-container');
    if (!box) {
      const style = document.createElement('style');
      style.textContent = DEVTOOLS_ISOLATED_CSS;
      root.appendChild(style);
      box = document.createElement('div');
      box.id = 'devtools-app-container';
      box.className = 'ndt-root';
      root.appendChild(box);
    }
    setContainer(box);
  }, []);

  return (
    <div
      ref={hostRef}
      id="__next_devtools_host"
      data-theme={resolved}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'none' }}
    >
      {container && createPortal(children, container)}
    </div>
  );
};
