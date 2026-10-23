import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { NetworkEntry } from '../../shared/types';
import { isSensitive } from '../../shared/utils';
import { buildCurl, buildFetchSnippet, buildHarEntry, type CurlOptions } from './curl-generator';
import { copyText, useLocalStorage, useRedact } from './ui';

export type CopyKind = 'curl' | 'curl-cmd' | 'curl-ps' | 'fetch' | 'har' | 'curl-redacted';

export const COPY_LABELS: Record<CopyKind, string> = {
  curl: 'Copy cURL',
  'curl-cmd': 'Copy cURL (cmd)',
  'curl-ps': 'Copy cURL (PowerShell)',
  fetch: 'Copy as fetch',
  har: 'Copy as HAR entry',
  'curl-redacted': 'Copy cURL (redacted)',
};

interface CopyApi {
  copy: (entry: NetworkEntry, kind: CopyKind) => Promise<boolean>;
  command: (entry: NetworkEntry, kind: CopyKind) => string;
  includeCookie: boolean;
  setIncludeCookie: (v: boolean) => void;
}

const Ctx = createContext<CopyApi | null>(null);
export const useCopy = (): CopyApi => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCopy must be used inside <CopyProvider>');
  return c;
};

/** Owns the copy-as-* actions, the "Copied" announcement and the one-time credentials hint. */
export function CopyProvider({ children }: { children: React.ReactNode }) {
  const rules = useRedact();
  const [includeCookie, setIncludeCookie] = useLocalStorage('next-devtools:include-cookie', false);
  const [hintDismissed, setHintDismissed] = useLocalStorage('next-devtools:hint-dismissed', false);
  const [toast, setToast] = useState<{ msg: string; hint: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const command = useCallback(
    (entry: NetworkEntry, kind: CopyKind): string => {
      const opts: CurlOptions = { includeCookie, redact: kind === 'curl-redacted' ? rules : null };
      switch (kind) {
        case 'curl-cmd':
          return buildCurl(entry.request, 'cmd', opts);
        case 'curl-ps':
          return buildCurl(entry.request, 'powershell', opts);
        case 'fetch':
          return buildFetchSnippet(entry.request, opts);
        case 'har':
          return JSON.stringify(buildHarEntry(entry, opts), null, 2);
        default:
          return buildCurl(entry.request, 'bash', opts);
      }
    },
    [includeCookie, rules],
  );

  const copy = useCallback(
    async (entry: NetworkEntry, kind: CopyKind) => {
      const ok = await copyText(command(entry, kind));
      if (!ok) return false;
      const hasSecrets =
        kind !== 'curl-redacted' && Object.keys(entry.request.headers).some((h) => isSensitive(h, rules));
      setToast({ msg: `${COPY_LABELS[kind].replace('Copy ', 'Copied ')} ✓`, hint: hasSecrets && !hintDismissed });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 3500);
      return true;
    },
    [command, rules, hintDismissed],
  );

  return (
    <Ctx.Provider value={{ copy, command, includeCookie, setIncludeCookie }}>
      {children}
      <div className="ndt-toast" role="status" aria-live="polite">
        {toast && (
          <>
            <span>{toast.msg}</span>
            {toast.hint && (
              <span className="ndt-muted">
                {' '}
                Copied with real credentials. Be careful when sharing.{' '}
                <button type="button" className="ndt-link" onClick={() => { setHintDismissed(true); setToast(null); }}>
                  Dismiss
                </button>
              </span>
            )}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}
