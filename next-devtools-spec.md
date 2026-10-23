# Technical Specification & RFC: `next-devtools`

> **Package Name:** `next-devtools` (or `@<scope>/next-devtools`)  
> **Target Framework:** Next.js 14, 15, and 16 (App Router & Pages Router)  
> **Objective:** Zero-config, extensible in-app floating DevTools widget for Next.js. Offers deep runtime observability into **Network requests**, **Server Actions**, **Next.js Cache**, and **Runtime Diagnostics** with **0 bytes memory retained on server** and zero styling conflicts.

---

## 1. Executive Summary & Philosophy

Existing tools like browser extensions or heavy logging libraries often fail in modern Next.js environments because of:
1. **Server Memory Leaks:** Accumulating requests in persistent server-side ring buffers.
2. **Next.js Internal Breakages:** Careless client-side `window.fetch` monkeypatching that crashes Next.js RSC router prefetching (`Cannot read properties of undefined (reading 'toUpperCase')` or infinite refresh loops).
3. **Complex Setup:** Requiring custom WebSocket servers, proxy routes, or browser extension installations.
4. **CSS Pollution:** In-app widgets conflicting with the host app's Tailwind, CSS modules, or global styles.

### Core Architectural Pillars of `next-devtools`
- **Zero Server State (Stream & Forget):** Server-side activities captured via `instrumentation.ts` are broadcasted in real-time via Server-Sent Events (SSE) and **immediately garbage collected** from server memory.
- **Client Storage Offloading:** All log retention, filtering, and history are stored exclusively inside the browser's **`IndexedDB`** (with fallback to `sessionStorage`).
- **Extensible Multi-Tab Architecture:** Designed as a modular DevTools suite:
  - 🌐 **Network Tab:** Inspect Server & Client HTTP requests, status, latency, headers, payload, and cURL export.
  - ⚡ **Actions Tab:** Track Server Action invocations, arguments, and return values.
  - 💾 **Cache Tab:** Inspect Next.js Data Cache tags, HIT/MISS states, and revalidation.
  - ⚙️ **System Tab:** Inspect Node runtime, Next.js version, memory footprint, and environment config.
- **RSC & Internal Navigation Immunity:** Strict bypass rules for all internal Next.js traffic (`/_next/*`, prefetch, HMR chunks).
- **Shadow DOM UI Isolation:** Floating trigger and drawer render inside an isolated Shadow DOM root.
- **Dead-Simple DX (2-Step Setup):**
  1. One line in `src/instrumentation.ts`.
  2. One component in `src/app/layout.tsx`.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│ SERVER RUNTIME (Node.js / Edge)                                       │
│                                                                        │
│  instrumentation.ts                                                    │
│    └─► registerNextDevTools()                                          │
│          ├─► Proxies globalThis.fetch (Network Inspector)              │
│          ├─► Observes Server Actions & Cache Traces                    │
│          │                                                             │
│          └─► [Stream & Forget]                                        │
│                └─► Broadcast to SSE Handler (/api/__devtools/sse)      │
│                      │ (0 bytes retained in server RAM!)               │
└──────────────────────┼─────────────────────────────────────────────────┘
                       │ Server-Sent Events (SSE)
                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ BROWSER CLIENT (User's Tab)                                           │
│                                                                        │
│  <NextDevTools />                                                      │
│    │                                                                   │
│    ├─► EventSource Listener ◄─── (Receives Server-side logs via SSE)   │
│    │                                                                   │
│    ├─► Safe window.fetch Proxy ─ (Captures Client-side API calls)      │
│    │     └─► Filter: Bypasses /_next/*, HMR, & devtools routes         │
│    │                                                                   │
│    ├─► Storage Engine (IndexedDB / sessionStorage)                     │
│    │     └─► Holds last 200 items (Configurable, client memory only)   │
│    │                                                                   │
│    └─► UI Layer (Shadow DOM Encapsulated)                              │
│          ├─ Floating Badge (Counter, Status badges, Latency)          │
│          └─ Slide-over Drawer (Tabs: Network, Actions, Cache, System)  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Package File Structure

```text
next-devtools/
├── package.json
├── tsup.config.ts
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                      # Client entry: <NextDevTools />
│   ├── server/
│   │   ├── index.ts                  # Server entry: registerNextDevTools()
│   │   ├── patch-fetch.ts            # Node.js globalThis.fetch proxy
│   │   ├── event-broadcaster.ts      # Pub/sub broadcaster for active SSE clients
│   │   └── route-handler.ts          # GET SSE handler for Next.js App Router
│   ├── client/
│   │   ├── dev-tools.tsx             # Main floating widget UI container
│   │   ├── shadow-wrapper.tsx        # Shadow DOM boundary container
│   │   ├── patch-client.ts           # Safe window.fetch proxy
│   │   ├── sse-client.ts             # SSE EventSource listener
│   │   ├── storage.ts                # IndexedDB adapter for request logs
│   │   └── components/
│   │       ├── trigger-button.tsx    # Draggable floating badge with badges
│   │       ├── drawer.tsx            # Slide-over dock with tab switcher
│   │       ├── tabs/
│   │       │   ├── network-tab.tsx   # Network table & detail view
│   │       │   ├── actions-tab.tsx   # Server Actions inspector
│   │       │   ├── cache-tab.tsx     # Next.js Cache inspector
│   │       │   └── system-tab.tsx    # System diagnostics & env viewer
│   │       ├── detail-view.tsx       # Headers, payload, response viewer
│   │       └── curl-generator.ts     # Generate copy-pasteable cURL command
│   └── shared/
│       ├── types.ts                  # Shared data schemas (DevToolsEntry, etc.)
│       └── utils.ts                  # Formatting, URL parser, sanitizers
```

---

## 4. Detailed Component Implementation Specs

### 4.1. Shared Types (`src/shared/types.ts`)

```typescript
export type DevToolsCategory = 'network' | 'action' | 'cache' | 'system';
export type RequestOrigin = 'server' | 'client';

export interface NetworkRequestInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  timestamp: number;
}

export interface NetworkResponseInfo {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string | null;
  durationMs: number;
}

export interface NetworkEntry {
  id: string;
  category: 'network';
  origin: RequestOrigin;
  request: NetworkRequestInfo;
  response?: NetworkResponseInfo;
  error?: string;
  state: 'pending' | 'completed' | 'failed';
}

export interface ActionEntry {
  id: string;
  category: 'action';
  actionName: string;
  args: any[];
  result?: any;
  error?: string;
  durationMs: number;
  timestamp: number;
}

export interface CacheEntry {
  id: string;
  category: 'cache';
  key: string;
  tags: string[];
  status: 'HIT' | 'MISS' | 'STALE' | 'REVALIDATED';
  timestamp: number;
}

export type DevToolsEntry = NetworkEntry | ActionEntry | CacheEntry;
```

---

### 4.2. Server: `event-broadcaster.ts` (Zero-Storage Broadcaster)

```typescript
import { DevToolsEntry } from '../shared/types';

type Listener = (entry: DevToolsEntry) => void;
const listeners = new Set<Listener>();

export const broadcaster = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  broadcast(entry: DevToolsEntry): void {
    // Fire and forget: if no listeners are open, discard immediately.
    // NEVER buffer entries here. Server retains 0 bytes in memory.
    for (const listener of listeners) {
      try {
        listener(entry);
      } catch {
        // Safe swallow to avoid crashing the server
      }
    }
  },
};
```

---

### 4.3. Server: `patch-fetch.ts` & `registerNextDevTools`

```typescript
import { broadcaster } from './event-broadcaster';
import { NetworkEntry } from '../shared/types';

let isPatched = false;

export function registerNextDevTools() {
  if (isPatched || typeof globalThis.fetch !== 'function') return;
  isPatched = true;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startTime = Date.now();
    const id = `srv_${startTime}_${Math.random().toString(36).substring(2, 7)}`;

    // Safe URL and method extraction
    const url = typeof input === 'string' 
      ? input 
      : input instanceof URL 
      ? input.toString() 
      : input.url;

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // Skip internal Next.js SSE or dev endpoints to prevent recursion
    if (url.includes('/__devtools')) {
      return originalFetch(input, init);
    }

    let requestBody: string | null = null;
    if (init?.body && typeof init.body === 'string') {
      requestBody = init.body;
    }

    const entry: NetworkEntry = {
      id,
      category: 'network',
      origin: 'server',
      state: 'pending',
      request: {
        url,
        method,
        headers: (init?.headers as Record<string, string>) || {},
        body: requestBody,
        timestamp: startTime,
      },
    };

    // Broadcast pending status
    broadcaster.broadcast(entry);

    try {
      const response = await originalFetch(input, init);
      const durationMs = Date.now() - startTime;

      // Clone response to read body without locking the original stream
      const clonedResponse = response.clone();
      let responseBody: string | null = null;
      try {
        const text = await clonedResponse.text();
        responseBody = text.length > 500_000 ? '[Body too large to preview]' : text;
      } catch {
        responseBody = '[Unreadable Stream / Binary]';
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      broadcaster.broadcast({
        ...entry,
        state: 'completed',
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          durationMs,
        },
      });

      return response;
    } catch (err: any) {
      broadcaster.broadcast({
        ...entry,
        state: 'failed',
        error: err?.message || 'Network request failed',
        response: {
          status: 0,
          statusText: 'FETCH_ERROR',
          headers: {},
          durationMs: Date.now() - startTime,
        },
      });
      throw err;
    }
  };
}
```

---

### 4.4. Server: SSE Route Handler (`src/server/route-handler.ts`)

```typescript
// Inside user's app: app/api/__devtools/sse/route.ts
// export { GET } from 'next-devtools/server/route';

import { broadcaster } from './event-broadcaster';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(': connected\n\n'));

      const unsubscribe = broadcaster.subscribe((entry) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
      });

      // Cleanup on client disconnect
      return () => {
        unsubscribe();
      };
    },
    cancel() {
      // Stream cancelled by client
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

---

### 4.5. Client: Safe Fetch Interceptor (`src/client/patch-client.ts`)

> [!CRITICAL]
> **Must NEVER crash Next.js RSC router prefetch!**  
> Next.js router uses custom `Request` objects where `method` may be undefined, and requests to `/_next/` must NEVER be delayed or intercepted.

```typescript
import { NetworkEntry } from '../shared/types';

export function setupClientFetchProxy(onEntry: (entry: NetworkEntry) => void) {
  if (typeof window === 'undefined' || !(window as any).fetch) return;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl = typeof input === 'string' 
      ? input 
      : input instanceof URL 
      ? input.toString() 
      : (input as Request)?.url || '';

    // 1. STRICT BYPASS: Next.js internal router, HMR, assets, RSC payload prefetch
    if (
      !rawUrl ||
      rawUrl.includes('/_next/') ||
      rawUrl.includes('/__nextjs') ||
      rawUrl.includes('/api/__devtools')
    ) {
      return originalFetch.apply(this, [input, init] as any);
    }

    // 2. Safe method parsing
    let method = 'GET';
    if (init?.method) {
      method = init.method.toUpperCase();
    } else if (input instanceof Request && input.method) {
      method = input.method.toUpperCase();
    }

    const startTime = Date.now();
    const id = `cli_${startTime}_${Math.random().toString(36).substring(2, 7)}`;

    const entry: NetworkEntry = {
      id,
      category: 'network',
      origin: 'client',
      state: 'pending',
      request: {
        url: rawUrl,
        method,
        headers: (init?.headers as Record<string, string>) || {},
        timestamp: startTime,
      },
    };

    onEntry(entry);

    try {
      const response = await originalFetch.apply(this, [input, init] as any);
      const durationMs = Date.now() - startTime;

      const cloned = response.clone();
      let responseBody: string | null = null;
      try {
        const text = await cloned.text();
        responseBody = text.length > 500_000 ? '[Body too large]' : text;
      } catch {
        responseBody = '[Unreadable Stream]';
      }

      onEntry({
        ...entry,
        state: 'completed',
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: {},
          body: responseBody,
          durationMs,
        },
      });

      return response;
    } catch (err: any) {
      onEntry({
        ...entry,
        state: 'failed',
        error: err?.message || 'Client fetch failed',
        response: {
          status: 0,
          statusText: 'CLIENT_ERROR',
          headers: {},
          durationMs: Date.now() - startTime,
        },
      });
      throw err;
    }
  };
}
```

---

### 4.6. Client: Storage Layer (`src/client/storage.ts`)

- **Database:** `next_devtools_db`
- **Stores:** `entries` (keyPath: `id`), `settings`
- **Ring Buffer:** Retains up to 200 items in browser storage (evicts oldest on overflow).
- **Persistence:** Persists across page reloads and browser navigations.

---

### 4.7. UI: Shadow DOM Encapsulation (`src/client/shadow-wrapper.tsx`)

To prevent any conflict with host CSS:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export const ShadowWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    if (hostRef.current && !hostRef.current.shadowRoot) {
      const root = hostRef.current.attachShadow({ mode: 'open' });
      
      const style = document.createElement('style');
      style.textContent = DEVTOOLS_ISOLATED_CSS;
      root.appendChild(style);
      
      const container = document.createElement('div');
      container.id = 'devtools-app-container';
      root.appendChild(container);

      setShadowRoot(root);
    }
  }, []);

  return (
    <div ref={hostRef} id="__next_devtools_host" style={{ position: 'relative', zIndex: 999999 }}>
      {shadowRoot && ReactDOM.createPortal(children, shadowRoot.getElementById('devtools-app-container')!)}
    </div>
  );
};
```

---

## 5. UI/UX Specification

> **Language:** All UI copy, labels, tooltips, and empty states are in **English**.  
> **Style:** shadcn/ui-inspired — neutral palette, 1px hairline borders, subtle radius, no heavy shadows or gradients.  
> **Principle:** *Stay out of the way.* The widget must be tiny when idle and never cover meaningful app UI.

### 5.1. Design Tokens (CSS variables, scoped inside the Shadow DOM)

Tokens mirror shadcn/ui naming so the builder can reuse familiar conventions. Defined on `:host`, never leaked to the host app. Dark/light follows `prefers-color-scheme` by default, overridable via the `theme` prop.

```css
:host {
  --radius: 0.5rem;
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --ring: 240 5% 64.9%;
  --success: 142 71% 35%;
  --warning: 38 92% 45%;
  --destructive: 0 72% 51%;
  --info: 217 91% 55%;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
}
:host([data-theme='dark']) {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --border: 240 3.7% 15.9%;
}
```

| Token | Usage |
| --- | --- |
| Font size | 12px base (`text-xs`), 11px for metadata, 13px for panel titles |
| Row height | 28px (compact list) |
| Radius | `--radius` (8px) panel, 6px controls, 4px badges |
| Motion | 120–160ms ease-out; respects `prefers-reduced-motion` |
| Icons | Inline SVG (Lucide-style, 14px, 1.5 stroke) — no icon font or external dependency |

### 5.2. Floating Trigger (Collapsed State)

A **small, quiet pill** — roughly the size and visual weight of the Next.js dev indicator.

```
 ┌──────────────────┐
 │ ◉  12   ● 2      │   ← 28px tall, ~72px wide
 └──────────────────┘
   │   │     └─ error count (destructive color, hidden when 0)
   │   └─ total request count (tabular-nums)
   └─ status dot: green = idle/ok, amber = pending, red = has errors
```

- Size: `height: 28px`, padding `0 10px`, `border-radius: 9999px`, 1px border, `background: hsl(var(--background) / 0.9)` with `backdrop-filter: blur(6px)`.
- Idle opacity `0.7`, `1` on hover/focus. No animation except a 1.2s soft pulse on the status dot while requests are pending.
- Click toggles the panel. `Alt + D` (configurable) toggles it from the keyboard.
- Right-click (or long-press) opens a tiny context menu: *Move to corner*, *Hide for this session*, *Clear all*.

### 5.3. Positioning (Same Behavior as the Next.js Dev Indicator)

The trigger is **freely repositionable** and **snaps to the four corners**.

| Behavior | Spec |
| --- | --- |
| Default | `bottom-right`, inset `16px` from viewport edges |
| Drag | Pointer-drag the pill anywhere (Pointer Events API; works for mouse, touch, pen). Drag threshold 4px to avoid swallowing clicks |
| Snap | On release, animates (160ms) to the nearest corner: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| Persist | Position saved to `localStorage` key `next-devtools:position` and restored on load |
| Viewport safety | Re-clamped on `resize` and on orientation change; never fully off-screen |
| Prop override | `<NextDevTools position="bottom-left" />` sets the initial corner (user drag still wins after first interaction) |
| Panel anchoring | The expanded panel opens **from the same corner** the trigger is snapped to (grows up/down and left/right away from the edge) |
| Safe area | Respects `env(safe-area-inset-*)` on mobile |

### 5.4. Expanded Panel (Minimalist, Compact)

Default size is deliberately small: **`420px × 360px`**, resizable by dragging the edge opposite the anchored corner (min `340×240`, max `90vw × 80vh`). A "maximize" button expands to a larger inspector view (see 5.5, item 9). Size persists in `localStorage` (`next-devtools:size`).

```
┌──────────────────────────────────────────────┐
│ Network  Actions  Cache  System        ⤢  ✕ │  ← 36px header, underline tabs
├──────────────────────────────────────────────┤
│ 🔍 Filter…        [All ▾] [Server|Client] 🗑  │  ← 32px toolbar
├──────────────────────────────────────────────┤
│ GET  /api/vouchers            200  84ms  1.2kB│
│ POST /api/claim               409  41ms  0.1kB│  ← 28px rows, mono font
│ GET  /api/profile             200  63ms  0.8kB│
│ …                                            │
└──────────────────────────────────────────────┘
```

- **Header:** underline-style tabs (shadcn `Tabs`), icon-less labels, with `Maximize` and `Close` ghost icon-buttons on the right.
- **Toolbar:** a single row — search input (ghost style), a status filter (`All`, `2xx`, `3xx`, `4xx`, `5xx`, `Failed`), an origin toggle (`All | Server | Client`), and a `Clear` button.
- **Request row** (28px, monospace, truncated with ellipsis, full URL on hover via `title`):
  - Method badge (colored text, not filled): `GET` info, `POST` success, `PUT/PATCH` warning, `DELETE` destructive.
  - Path (query string dimmed, host hidden unless it differs from the app origin).
  - Status badge (`200` success, `4xx` warning, `5xx`/failed destructive, `…` pending).
  - Duration and size, right-aligned, `tabular-nums`, `muted-foreground`.
  - A thin 2px **waterfall bar** under the row, scaled to the slowest visible request (optional, toggle in settings).
- **Selecting a row** switches the panel body to the detail view (5.5) with a `← Back` link; the list scroll position is preserved. Keyboard: `↑/↓` navigate, `Enter` open, `Esc` back/close, `/` focus search, `C` copy cURL for the selected row.
- **Empty state:** one muted line — *"No requests yet. API calls will appear here."*
- **List performance:** virtualized rows (windowing) so 200+ entries stay smooth.

### 5.5. Detail View — Long Request/Response Without Losing Information

Payloads are often huge. The rule: **collapse by default, never discard.** The user can always reach 100% of the data in at most one click.

**Layout**

```
┌──────────────────────────────────────────────┐
│ ← Back   POST /api/claim        [Copy cURL ▾]│
│ 409 Conflict · 41ms · 0.1kB · Server         │  ← summary line
├──────────────────────────────────────────────┤
│ Headers  Payload  Response  Timing           │  ← sub-tabs
├──────────────────────────────────────────────┤
│ ▸ General                                    │
│ ▾ Request Headers (7)                        │
│     content-type: application/json           │
│     authorization: Bearer ••••••••  [Reveal] │
│ ▸ Response Headers (9)                       │
└──────────────────────────────────────────────┘
```

**Techniques to keep it clean yet complete**

1. **Progressive disclosure (accordions):** Headers, General, and Timing sections are collapsible (`▸/▾`), with counts in the title. Only *General* and *Request Headers* are open by default.
2. **Collapsible JSON tree viewer** for `application/json` bodies:
   - Root expanded **1 level** by default; deeper nodes collapsed, each showing a preview (`{ 4 keys }`, `[ 120 items ]`).
   - Per-node expand/collapse, plus `Expand all` / `Collapse all` / `Expand to level N`.
   - Long strings are truncated at **160 chars** with an inline `Show more (N chars)` toggle — the full value stays in the DOM data, never dropped.
   - Arrays over **50 items** are paginated/windowed (`Show next 50`), indexed so nothing is lost.
   - Syntax colors limited to 4 tones (key, string, number, boolean/null) from the token palette.
   - Click on a value copies it; hover shows a tiny copy icon at the line end; right-click path copies a JSONPath (e.g. `$.data.items[0].id`).
3. **View modes per body:** segmented control `Tree | Raw | Preview`.
   - *Tree:* the JSON viewer above.
   - *Raw:* pretty-printed text in a monospace block with **soft-wrap toggle** and line numbers.
   - *Preview:* images, HTML (sandboxed iframe), and other renderable types.
4. **Bounded height + internal scroll:** each body block is capped at `max-height: 240px` with its own scroll, plus an `Expand` button that grows it to full height or opens the maximized inspector. Sticky mini-toolbar inside each block: `Copy`, `Wrap`, `Expand`, `Download`.
5. **In-body search:** `Ctrl/Cmd + F` inside a body highlights matches and jumps between them (`Enter` / `Shift+Enter`) with a `3/17` counter; matching tree nodes auto-expand.
6. **Large payload safety:** bodies over **256 kB** render *Raw* lazily in chunks ("Load more"); over **2 MB** show size + `Download full body` instead of rendering, so the UI never freezes. The complete body is still held in IndexedDB and in the cURL/download output.
7. **Binary & streams:** show `[binary · image/png · 24 kB]` with `Download`/`Preview` instead of garbage text.
8. **Sensitive values:** `authorization`, `cookie`, `set-cookie`, `x-api-key`, and fields matching `/token|secret|password/i` are masked as `••••••••` with a per-value `Reveal` toggle. Configurable via `redact` prop.
9. **Maximize (⤢):** opens a two-pane layout — request list on the left (≈35%), detail on the right (≈65%) — for deep inspection while the default panel stays tiny.
10. **Diff-friendly formatting:** keys are shown in original order; header names lower-cased; durations and sizes use consistent units (`ms`, `kB`).

**Timing sub-tab:** a compact horizontal bar chart (Queued → Request sent → Waiting (TTFB) → Content download), only values actually measurable per origin.

### 5.6. Copyable cURL

The **`Copy cURL`** control is a split button in the detail header and available as a hover action on every list row and via the `C` shortcut.

| Option | Output |
| --- | --- |
| **Copy cURL** (default) | Single-line-per-flag command, bash-compatible, with line continuations (`\`) for readability |
| Copy cURL (cmd) | Windows `cmd.exe` quoting (`^` continuations, double quotes) |
| Copy cURL (PowerShell) | `Invoke-WebRequest`-style / escaped quoting |
| Copy as fetch | `fetch(url, init)` snippet for the browser console |
| Copy as HAR entry | Single HAR 1.2 entry JSON |

**Generation rules (`curl-generator.ts`)**

```bash
curl 'https://api.example.com/v1/claim' \
  -X POST \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <TOKEN>' \
  --data-raw '{"voucherId":"v_123"}' \
  --compressed
```

- Escape single quotes with the `'\''` idiom; use `$'...'` for bodies containing control characters/newlines.
- Omit `-X GET`; add `-X` only for non-GET/HEAD. Use `--data-raw` (never `-d`, to avoid `@file` interpretation).
- Skip browser-managed headers (`host`, `content-length`, `connection`, `accept-encoding`, `sec-*`, `origin`, `referer`) — **but** keep `cookie` when the user opts in.
- **Secrets:** by default the copied command contains the **real values** (so it actually works) — a one-time dismissible hint appears: *"Copied with real credentials. Be careful when sharing."* A `Redacted` variant (`Copy cURL (redacted)`) replaces secrets with `<REDACTED>` placeholders.
- Relative URLs are resolved against `location.origin`; server-origin requests use the absolute URL as called.
- Bodies that are `FormData`/`Blob` are represented with `-F 'field=value'` or a `# binary body omitted` comment line.
- Feedback: button label flips to `Copied ✓` for 1.5s (and an `aria-live="polite"` announcement). Falls back to a hidden `textarea` + `execCommand('copy')` when `navigator.clipboard` is unavailable (non-HTTPS dev hosts).
- A **"View cURL"** popover shows the command in a read-only code block before copying, so the user can verify it.

### 5.7. Other Tabs (Same Visual Language)

| Tab | List row | Detail |
| --- | --- | --- |
| **Actions** | `actionName · 120ms · ✓/✗` | Arguments & result in the same JSON tree viewer; error stack collapsed by default |
| **Cache** | `key · [HIT/MISS/STALE/REVALIDATED] badge` | Tags as chips; revalidation timeline |
| **System** | Key–value table grouped by *Runtime*, *Next.js*, *Memory*, *Env (public only)* | Memory shown as a compact bar; `NEXT_PUBLIC_*` only — server secrets never shown |

### 5.8. Accessibility & Quality Bars

- Fully keyboard operable; visible focus ring (`--ring`, 2px offset); roles: `tablist/tab/tabpanel`, `listbox/option`, `dialog` (non-modal, no focus trap on the collapsed pill).
- Contrast ≥ **WCAG AA** in both themes; status is never conveyed by color alone (text/icons accompany it).
- `z-index: 2147483000` on the host; `pointer-events: none` on the host wrapper, `auto` only on the pill/panel, so the widget never blocks page clicks.
- No layout shift on the host page (`position: fixed`; no body padding changes).
- Must not mount on the server or in production builds unless explicitly enabled (`enabled` prop defaults to `process.env.NODE_ENV === 'development'`).
- Bundle budget: UI layer **< 40 kB gzipped**, zero runtime UI dependencies (own tiny primitives styled to match shadcn/ui; no Radix/Tailwind requirement on the host).

### 5.9. Public UI Props

```tsx
<NextDevTools
  position="bottom-right"          // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  theme="system"                   // 'light' | 'dark' | 'system'
  defaultOpen={false}
  hotkey="alt+d"
  maxEntries={200}
  redact={['authorization', 'cookie', /token/i]}
  tabs={['network', 'actions', 'cache', 'system']}
  enabled={process.env.NODE_ENV === 'development'}
/>
```

---

## 6. Developer Experience (Installation & Usage)

### Step 1: Install Package
```bash
npm install next-devtools
```

### Step 2: Register Instrumentation
```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNextDevTools } = await import('next-devtools/server');
    registerNextDevTools();
  }
}
```

### Step 3: Add Component to Root Layout
```tsx
// src/app/layout.tsx
import { NextDevTools } from 'next-devtools';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <NextDevTools />}
      </body>
    </html>
  );
}
```

### Step 4: Mount the SSE Route
```typescript
// src/app/api/__devtools/sse/route.ts
export { GET } from 'next-devtools/server/route';
```

---

## 7. Build & Packaging Configuration

### `tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server/index.ts',
    'server/route': 'src/server/route-handler.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['next', 'react', 'react-dom'],
  minify: false,
});
```

### `package.json` Exports Map
```json
{
  "name": "next-devtools",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.mjs",
      "require": "./dist/server.js"
    },
    "./server/route": {
      "types": "./dist/server/route.d.ts",
      "import": "./dist/server/route.mjs",
      "require": "./dist/server/route.js"
    }
  },
  "peerDependencies": {
    "next": ">=14.0.0",
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

---

## 8. QA & Verification Checklist for the Builder Agent

1. **RSC Navigation Test:**
   - Click `<Link href="/login">` or use `router.push()`. Verify console has zero `toUpperCase` errors and does NOT trigger infinite browser reload.
2. **Server Memory Test:**
   - Trigger 500 server-side API requests via Route Handler or Server Component.
   - Inspect Node.js process heap memory (`process.memoryUsage().heapUsed`). Verify memory remains flat (0 memory retained after GC).
3. **SSE Connection Resilience:**
   - Test client browser refresh, tab close, and reconnect. Ensure no unhandled stream controller errors on server.
4. **Style Isolation Test:**
   - Run in an app with Tailwind CSS and an app with Vanilla CSS. Verify that host styles do not leak into the devtools and devtools styles do not leak into the host page.
5. **cURL Export Validation:**
   - Click "Copy cURL" on a captured request, paste it into terminal, and confirm the identical response is returned (including bodies with single quotes, newlines, and unicode).
6. **Floating Widget Positioning:**
   - Drag the pill to each corner; confirm snap, persistence after reload, re-clamping on window resize, and that the panel opens away from the anchored edge.
7. **Large Payload Handling:**
   - Capture a 5 MB JSON response and a response with a 10,000-char string and a 5,000-item array. Confirm the UI stays responsive, truncated values expand fully on demand, and no data is lost in Raw view/Download/cURL.
8. **Redaction & Accessibility:**
   - Confirm sensitive headers/fields are masked with working `Reveal`, full keyboard navigation works, and the widget never blocks clicks on the host page.

