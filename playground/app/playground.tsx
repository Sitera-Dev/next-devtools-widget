'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { checkoutWithPostApi, claim, claimWithFetch } from './actions';

export function Playground() {
  const router = useRouter();
  const [out, setOut] = useState('');
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const res = await fn();
      setOut(`${label}: ${JSON.stringify(res, null, 2).slice(0, 200)}`);
    } catch (e) {
      setOut(`${label} failed: ${(e as Error).message}`);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 460 }}>
      <button id="get" onClick={() => run('GET /api/demo', () => fetch('/api/demo').then((r) => r.json()))}>
        GET /api/demo
      </button>
      <button id="get404" onClick={() => run('GET 404', () => fetch('/api/demo?status=404').then((r) => r.status))}>
        GET 404
      </button>
      <button
        id="post"
        onClick={() =>
          run('POST /api/demo', () =>
            fetch('/api/demo', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: 'Bearer secret-abc' },
              body: JSON.stringify({ name: "it's", note: 'line1\nline2 é🚀', password: 'hunter2' }),
            }).then((r) => r.json()),
          )
        }
      >
        POST /api/demo
      </button>
      <button id="big" onClick={() => run('GET big (5MB)', () => fetch('/api/demo?big=1').then((r) => r.json().then((j) => j.items.length)))}>
        GET big (5MB)
      </button>
      <button id="fail" onClick={() => run('fetch fails', () => fetch('http://localhost:1/nope'))}>
        fetch fails
      </button>

      <hr style={{ margin: '8px 0', borderColor: '#ccc' }} />
      <strong>Server Actions:</strong>

      <button id="action" onClick={() => run('Action: simple claim', () => claim('v_123'))}>
        Server Action: Simple claim
      </button>
      <button id="action-bad" onClick={() => run('Action: claim error', () => claim('bad'))}>
        Server Action: Claim error
      </button>

      {/* NEW: Server Action with internal fetch */}
      <button
        id="action-fetch"
        style={{ fontWeight: 'bold' }}
        onClick={() => run('Action: claimWithFetch', () => claimWithFetch('voucher_with_api_999'))}
      >
        ⚡ Server Action with GET fetch
      </button>
      <button
        id="action-post-fetch"
        style={{ fontWeight: 'bold' }}
        onClick={() => run('Action: checkoutWithPostApi', () => checkoutWithPostApi('v_checkout_888', 250000))}
      >
        ⚡ Server Action with POST fetch
      </button>

      <hr style={{ margin: '8px 0', borderColor: '#ccc' }} />
      <strong>Navigation:</strong>
      <button id="push" onClick={() => router.push('/login')}>
        router.push(/login)
      </button>
      <Link id="link" href="/rsc">
        Link to /rsc (Server Component with fetch)
      </Link>

      <pre id="out" style={{ whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', background: '#eee', padding: 8 }}>
        {out}
      </pre>
    </div>
  );
}
