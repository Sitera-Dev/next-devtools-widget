# next-devtools-widget

Zero-config in-app floating DevTools widget for Next.js 14, 15, and 16 (App Router & Pages Router). Deep runtime observability into **Network requests**, **Server Actions**, **Next.js Cache**, and **Runtime Diagnostics** with **0 bytes memory retained on server** and zero styling conflicts via Shadow DOM.

---

## Features

- 🌐 **Network Tab**: Inspect both Client-side and Server-side HTTP requests with latency, headers, payload previews, and cURL export.
- ⚡ **Actions Tab**: Deep inspection into Next.js Server Actions—track arguments, return values, errors, and duration. Supports Server Actions that make nested API `fetch()` calls.
- 💾 **Cache Tab**: Inspect Next.js Data Cache tags (`next.tags`), revalidation rules, and `HIT`/`MISS`/`STALE` cache states.
- ⚙️ **System Tab**: Real-time Node runtime diagnostics, Next.js version, platform, memory usage (heap bar), and connection status.
- 🛡️ **Shadow DOM UI Isolation**: Rendered inside an open Shadow DOM root. Host application styles (Tailwind, vanilla CSS, etc.) never leak into the widget, and DevTools styles never affect your page.
- 🪶 **Zero Server Memory Overhead**: Stream-and-forget architecture via Server-Sent Events (SSE). Requests are pushed directly to active clients and garbage collected immediately.
- 🔒 **Sensitive Data Redaction**: Automatic masking for sensitive headers and fields (`Authorization`, `Cookie`, `password`, `token`, etc.) with a per-value `Reveal` toggle.

---

## Installation

```bash
npm install next-devtools-widget
```

---

## Quickstart (2-Step Automated Setup)

### Step 1: Install & Initialize
Install the package and run the init CLI:

```bash
npm install next-devtools-widget
npx next-devtools-widget init
```

The CLI automatically:
- Creates the SSE API route handler (`app/api/next-devtools/sse/route.ts`).
- Sets up server instrumentation (`instrumentation.ts`).
- Supports both `src/app` and `app` directory structures, in TypeScript or JavaScript.

### Step 2: Add Component to Root Layout
Add `<NextDevTools />` to your root layout (`app/layout.tsx`):

```tsx
import { NextDevTools } from 'next-devtools-widget';

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

---

## Manual Setup (Alternative to CLI)

If you prefer to configure files manually without the CLI:

1. **Mount SSE Route Handler** (`app/api/next-devtools/sse/route.ts`):
   ```typescript
   export { GET } from 'next-devtools-widget/server/route';
   ```

2. **Register Server Instrumentation** (`instrumentation.ts`):
   ```typescript
   export async function register() {
     if (process.env.NEXT_RUNTIME === 'nodejs') {
       const { registerNextDevTools } = await import('next-devtools-widget/server');
       registerNextDevTools();
     }
   }
   ```

3. **Mount Component** (`app/layout.tsx`):
   ```tsx
   import { NextDevTools } from 'next-devtools-widget';
   // inside RootLayout:
   {process.env.NODE_ENV === 'development' && <NextDevTools />}
   ```

---

## Server Actions Instrumentation

You can track Server Actions and any nested API `fetch()` calls they perform by wrapping them with `trackServerAction`:

```typescript
'use server';

import { trackServerAction } from 'next-devtools-widget/server';

export const checkout = trackServerAction(
  'checkout',
  async (voucherId: string, quantity: number) => {
    // Nested server-side API call:
    // This will appear in the Network tab under origin: 'server' [S]
    const res = await fetch(`https://api.example.com/vouchers/${voucherId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });

    const data = await res.json();
    return { success: true, orderId: data.orderId };
  },
);
```

Both the Server Action (in the **Actions** tab) and the internal API fetch (in the **Network** tab) will be captured and visible in real-time.

---

## Props

```tsx
<NextDevTools
  position="bottom-right"       // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  theme="system"                // 'light' | 'dark' | 'system'
  defaultOpen={false}           // Open drawer initially
  hotkey="alt+d"                // Keyboard shortcut to toggle
  maxEntries={200}              // Ring buffer cap in IndexedDB
  redact={['authorization', 'cookie', /token/i]}
  tabs={['network', 'actions', 'cache', 'system']}
  enabled={process.env.NODE_ENV === 'development'}
/>
```

---

## License

MIT
