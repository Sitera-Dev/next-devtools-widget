import { setupSsrObserver } from './ssr-drainer';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RedactRule } from '../shared/types';
import { DEFAULT_REDACT } from '../shared/utils';
import { CopyProvider } from './components/copy-actions';
import { Drawer, type Corner, type TabId } from './components/drawer';
import { ActionsTab } from './components/tabs/actions-tab';
import { CacheTab } from './components/tabs/cache-tab';
import { NetworkTab } from './components/tabs/network-tab';
import { SystemTab } from './components/tabs/system-tab';
import { TriggerButton } from './components/trigger-button';
import { RedactContext, useLocalStorage } from './components/ui';
import { setupClientFetchProxy } from './patch-client';
import { drainTraceCookies } from './cookie-transport';
import { ShadowWrapper, type Theme } from './shadow-wrapper';
import { connectSse } from './sse-client';
import { store, useDevToolsState } from './store';

export interface NextDevToolsProps {
  /** Initial corner. A user drag wins (and is remembered) after the first interaction. */
  position?: Corner;
  theme?: Theme;
  defaultOpen?: boolean;
  /** e.g. `alt+d`, `ctrl+shift+k` */
  hotkey?: string;
  /** Ring buffer size kept in the browser. */
  maxEntries?: number;
  /** Header / JSON field names (string = exact, RegExp = pattern) masked in the UI. */
  redact?: RedactRule[];
  tabs?: TabId[];
  /** Defaults to `process.env.NODE_ENV === 'development'`. */
  enabled?: boolean;
}

// Patch as early as possible (module evaluation, before any effect runs) so no early fetch is missed.
// Recording is switched off in <NextDevTools enabled={false} />.
if (typeof window !== 'undefined') {
  setupClientFetchProxy(store.upsert);
}

const INSET = 16;
const PILL_H = 36;
const MIN_W = 340;
const MIN_H = 240;
const DEFAULT_SIZE = { w: 420, h: 360 };
const ALL_TABS: TabId[] = ['network', 'actions', 'cache', 'system'];

interface Box { t: number; r: number; b: number; l: number }

function readSafeArea(): Box {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const box = {
    t: parseFloat(cs.paddingTop) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0,
  };
  el.remove();
  return box;
}

function matchHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split('+').map((s) => s.trim());
  const key = parts.pop() ?? '';
  const mods = new Set(parts);
  if (
    e.altKey !== (mods.has('alt') || mods.has('option')) ||
    e.ctrlKey !== (mods.has('ctrl') || mods.has('control')) ||
    e.metaKey !== (mods.has('meta') || mods.has('cmd')) ||
    e.shiftKey !== mods.has('shift')
  ) {
    return false;
  }
  // `code` keeps Alt+D working on macOS, where Alt+D types a different character.
  return e.key.toLowerCase() === key || e.code.toLowerCase() === `key${key}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function NextDevTools({
  position = 'bottom-right',
  theme = 'system',
  defaultOpen = false,
  hotkey = 'alt+d',
  maxEntries = 200,
  redact = DEFAULT_REDACT,
  tabs = ALL_TABS,
  enabled = process.env.NODE_ENV === 'development' || process.env.NEXT_DEVTOOLS_ENABLED === 'true' || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === 'true',
}: NextDevToolsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (typeof window !== 'undefined') setupClientFetchProxy(store.upsert);
    store.setRecording(enabled);
  }, [enabled]);

  if (!enabled || !mounted) return null;
  return (
    <ShadowWrapper theme={theme}>
      <DevToolsApp position={position} defaultOpen={defaultOpen} hotkey={hotkey} maxEntries={maxEntries} redact={redact} tabs={tabs} />
    </ShadowWrapper>
  );
}

interface AppProps {
  position: Corner;
  defaultOpen: boolean;
  hotkey: string;
  maxEntries: number;
  redact: RedactRule[];
  tabs: TabId[];
}

function DevToolsApp({ position, defaultOpen, hotkey, maxEntries, redact, tabs }: AppProps) {
  const { entries, system, sse } = useDevToolsState();

  const [open, setOpen] = useState(defaultOpen);
  const [maximized, setMaximized] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('next-devtools:hidden') === '1';
    } catch {
      return false;
    }
  });
  const [corner, setCorner] = useLocalStorage<Corner>('next-devtools:position', position);
  const [size, saveSize] = useLocalStorage('next-devtools:size', DEFAULT_SIZE);
  const [waterfall, setWaterfall] = useLocalStorage('next-devtools:waterfall', false);
  const [liveSize, setLiveSize] = useState<typeof DEFAULT_SIZE | null>(null);
  const visibleTabs = tabs.length ? tabs : ALL_TABS;
  const [tab, setTab] = useState<TabId>(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  // ---- data plumbing ----
  useEffect(() => {
    store.configure({ maxEntries });
  }, [maxEntries]);
  useEffect(() => {
    void store.hydrate();
    const unsubSsr = setupSsrObserver(store.upsert);
    const unsubSse = connectSse();
    return () => { unsubSsr(); unsubSse(); };
  }, []);

  // ---- Server trace cookie transport (serverless / Vercel Lambda bridge) ----
  useEffect(() => {
    drainTraceCookies(store.upsert);
    const interval = setInterval(() => drainTraceCookies(store.upsert), 400);
    const onFocus = () => drainTraceCookies(store.upsert);
    const onVisibility = () => {
      if (document.visibilityState === "visible") drainTraceCookies(store.upsert);
    };
    const onClick = () => {
      setTimeout(() => drainTraceCookies(store.upsert), 50);
      setTimeout(() => drainTraceCookies(store.upsert), 200);
      setTimeout(() => drainTraceCookies(store.upsert), 500);
      setTimeout(() => drainTraceCookies(store.upsert), 1000);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("click", onClick, { passive: true });

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("click", onClick);
    };
  }, []);

  const counts = useMemo(() => {
    let total = 0, errors = 0, pending = 0;
    for (const e of entries) {
      if (e.category !== 'network') continue;
      total++;
      if (e.state === 'pending') pending++;
      if (e.state === 'failed' || (e.response && e.response.status >= 400)) errors++;
    }
    return { total, errors, pending };
  }, [entries]);

  // ---- viewport / geometry ----
  const [vp, setVp] = useState({ w: 1024, h: 768 });
  const [safe, setSafe] = useState<Box>({ t: 0, r: 0, b: 0, l: 0 });
  const [pillW, setPillW] = useState(36);
  const [animate, setAnimate] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      setVp({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
      setSafe(readSafeArea());
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    const t = setTimeout(() => setAnimate(true), 100);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      clearTimeout(t);
    };
  }, []);

  useLayoutEffect(() => {
    const w = pillRef.current?.offsetWidth;
    if (w && w !== pillW) setPillW(w);
  }, [counts.total, counts.errors, hidden, pillW]);

  const cornerXY = useCallback(
    (c: Corner) => ({
      x: c.endsWith('left') ? INSET + safe.l : vp.w - pillW - INSET - safe.r,
      y: c.startsWith('top') ? INSET + safe.t : vp.h - PILL_H - INSET - safe.b,
    }),
    [vp, safe, pillW],
  );

  // ---- pill drag + snap ----
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const pos = drag ?? cornerXY(corner);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    if (e.pointerType === 'touch') {
      const { clientX: x, clientY: y } = e;
      longPress.current = setTimeout(() => {
        if (!dragRef.current?.moved) {
          suppressClick.current = true;
          setMenu({ x, y });
        }
      }, 550);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return; // threshold: don't swallow plain clicks
    d.moved = true;
    clearTimeout(longPress.current);
    setDrag({ x: clamp(d.ox + dx, 0, vp.w - pillW), y: clamp(d.oy + dy, 0, vp.h - PILL_H) });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    clearTimeout(longPress.current);
    const d = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved || !drag) return;
    suppressClick.current = true;
    const cx = drag.x + pillW / 2;
    const cy = drag.y + PILL_H / 2;
    setCorner(`${cy < vp.h / 2 ? 'top' : 'bottom'}-${cx < vp.w / 2 ? 'left' : 'right'}` as Corner);
    setDrag(null); // transition animates the pill from the drop point to the corner
  };

  // ---- open / close ----
  const toggle = useCallback(() => {
    setHidden(false);
    try {
      sessionStorage.removeItem('next-devtools:hidden');
    } catch {
      /* ignore */
    }
    setOpen((o) => !o);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    pillRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchHotkey(e, hotkey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hotkey, toggle]);

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => {
      if (!e.composedPath().some((n) => (n as HTMLElement).classList?.contains('ndt-ctx'))) setMenu(null);
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [menu]);

  // ---- panel geometry ----
  const maxW = vp.w * 0.9;
  const maxH = vp.h * 0.8;
  const cur = liveSize ?? size;
  const width = maximized ? maxW : Math.min(maxW, Math.max(MIN_W, cur.w));
  const height = maximized ? maxH : Math.min(maxH, Math.max(MIN_H, cur.h));
  const panelStyle: React.CSSProperties = {
    width,
    height,
    ...(corner.startsWith('top') ? { top: INSET + safe.t + PILL_H + 8 } : { bottom: INSET + safe.b + PILL_H + 8 }),
    ...(corner.endsWith('left') ? { left: INSET + safe.l } : { right: INSET + safe.r }),
  };

  const resize = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { sx: e.clientX, sy: e.clientY, w: width, h: height };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    setLiveSize({
      w: Math.round(clamp(r.w + (corner.endsWith('right') ? -dx : dx), MIN_W, maxW)),
      h: Math.round(clamp(r.h + (corner.startsWith('bottom') ? -dy : dy), MIN_H, maxH)),
    });
  };
  const onResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resize.current) return;
    resize.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (liveSize) saveSize(liveSize);
    setLiveSize(null);
  };

  if (hidden) return null;

  return (
    <RedactContext.Provider value={redact}>
      <TriggerButton
        innerRef={pillRef}
        total={counts.total}
        errors={counts.errors}
        pending={counts.pending}
        x={pos.x}
        y={pos.y}
        open={open}
        dragging={!!drag}
        animate={animate}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          toggle();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      />

      {open && (
        <Drawer
          corner={corner}
          style={panelStyle}
          tabs={visibleTabs}
          active={activeTab}
          maximized={maximized}
          innerRef={panelRef}
          onTab={setTab}
          onClose={close}
          onToggleMaximize={() => setMaximized((m) => !m)}
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
        >
          <CopyProvider>
            {activeTab === 'network' && <NetworkTab entries={entries} maximized={maximized} waterfall={waterfall} onClear={store.clear} />}
            {activeTab === 'actions' && <ActionsTab entries={entries} onClear={store.clear} />}
            {activeTab === 'cache' && <CacheTab entries={entries} onClear={store.clear} />}
            {activeTab === 'system' && <SystemTab system={system} sse={sse} />}
          </CopyProvider>
        </Drawer>
      )}

      {menu && (
        <div
          className="ndt-ctx"
          role="menu"
          style={{ left: clamp(menu.x, 0, vp.w - 200), top: clamp(menu.y, 0, vp.h - 200) }}
        >
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Corner[]).map((c) => (
            <button key={c} type="button" role="menuitem" onClick={() => { setCorner(c); setMenu(null); }}>
              Move to {c.replace('-', ' ')}
            </button>
          ))}
          <div className="ndt-ctx-sep" />
          <button type="button" role="menuitem" onClick={() => { setWaterfall(!waterfall); setMenu(null); }}>
            {waterfall ? 'Hide' : 'Show'} waterfall bars
          </button>
          <button type="button" role="menuitem" onClick={() => { store.clear(); setMenu(null); }}>Clear all</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              try {
                sessionStorage.setItem('next-devtools:hidden', '1');
              } catch {
                /* ignore */
              }
              setOpen(false);
              setHidden(true);
              setMenu(null);
            }}
          >
            Hide for this session
          </button>
        </div>
      )}
    </RedactContext.Provider>
  );
}

export { NextDevTools as NextDevToolsClient };
