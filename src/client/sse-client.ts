import type { DevToolsEntry, SystemInfo } from '../shared/types';
import { store } from './store';

export const SSE_URL = '/api/next-devtools/sse';

/** Subscribe to server-side activity. Returns a disconnect function. */
export function connectSse(url: string = SSE_URL): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  store.setSse('connecting');
  const es = new EventSource(url);

  es.onopen = () => store.setSse('open');
  es.onmessage = (e) => {
    try {
      store.upsert(JSON.parse(e.data) as DevToolsEntry);
    } catch {
      /* ignore malformed frame */
    }
  };
  es.addEventListener('system', (e) => {
    try {
      store.setSystem(JSON.parse((e as MessageEvent).data) as SystemInfo);
    } catch {
      /* ignore malformed frame */
    }
  });
  // CLOSED = the route is missing / refused (no auto-retry); CONNECTING = browser is retrying.
  es.onerror = () => store.setSse(es.readyState === EventSource.CLOSED ? 'closed' : 'connecting');

  return () => {
    es.close();
    store.setSse('idle');
  };
}
