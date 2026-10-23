import React, { useState } from 'react';
import type { NetworkEntry } from '../../shared/types';
import { formatBytes, formatDuration } from '../../shared/utils';
import { BodyViewer } from './body-viewer';
import { COPY_LABELS, useCopy, type CopyKind } from './copy-actions';
import {
  Accordion,
  IconArrowLeft,
  IconChevronDown,
  IconCheck,
  KV,
  MaskedValue,
  methodTone,
  statusTone,
  useFlash,
} from './ui';

export function MethodBadge({ method }: { method: string }) {
  return <span className={`ndt-method tone-${methodTone(method)}`}>{method}</span>;
}

export function StatusBadge({ entry }: { entry: NetworkEntry }) {
  const status = entry.response?.status;
  const tone = statusTone(status, entry.state);
  const label = entry.state === 'pending' ? '…' : entry.state === 'failed' || !status ? 'ERR' : String(status);
  return <span className={`ndt-status tone-${tone}`}>{label}</span>;
}

/** Splits a URL into display parts; the host is only returned when it differs from the app origin. */
export function splitUrl(raw: string): { host: string; path: string; query: string } {
  try {
    const u = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    const foreign = typeof location !== 'undefined' && u.origin !== location.origin;
    return { host: foreign ? u.origin : '', path: u.pathname, query: u.search };
  } catch {
    return { host: '', path: raw, query: '' };
  }
}

function HeaderList({ headers }: { headers: Record<string, string> }) {
  const rows = Object.entries(headers);
  if (!rows.length) return <div className="ndt-muted">None</div>;
  return (
    <dl className="ndt-kv ndt-mono">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd><MaskedValue name={k} value={v} /></dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function CopySplitButton({ entry, onViewCurl }: { entry: NetworkEntry; onViewCurl: () => void }) {
  const { copy, includeCookie, setIncludeCookie } = useCopy();
  const [open, setOpen] = useState(false);
  const [done, flash] = useFlash();
  const run = async (kind: CopyKind) => {
    setOpen(false);
    if (await copy(entry, kind)) flash();
  };
  return (
    <div className="ndt-split">
      <button type="button" className="ndt-btn" onClick={() => run('curl')}>
        {done ? <IconCheck /> : null}
        {done ? 'Copied ✓' : 'Copy cURL'}
      </button>
      <button type="button" className="ndt-btn ndt-split-caret" aria-label="More copy options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconChevronDown />
      </button>
      {open && (
        <div className="ndt-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {(['curl-cmd', 'curl-ps', 'fetch', 'har', 'curl-redacted'] as CopyKind[]).map((k) => (
            <button key={k} type="button" role="menuitem" onClick={() => run(k)}>{COPY_LABELS[k]}</button>
          ))}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onViewCurl(); }}>View cURL</button>
          <label className="ndt-menu-check">
            <input type="checkbox" checked={includeCookie} onChange={(e) => setIncludeCookie(e.target.checked)} />
            Include cookie header
          </label>
        </div>
      )}
    </div>
  );
}

type Sub = 'headers' | 'payload' | 'response' | 'timing';

export function DetailView({ entry, onBack }: { entry: NetworkEntry; onBack: () => void }) {
  const { request: req, response: res } = entry;
  const [sub, setSub] = useState<Sub>('headers');
  const [showCurl, setShowCurl] = useState(false);
  const { command, copy } = useCopy();
  const { host, path, query } = splitUrl(req.url);

  const summary =
    entry.state === 'pending'
      ? 'Pending…'
      : entry.state === 'failed'
        ? `Failed · ${entry.error ?? 'Network error'} · ${formatDuration(res?.durationMs)}`
        : `${res?.status} ${res?.statusText} · ${formatDuration(res?.durationMs)} · ${formatBytes(res?.size)}`;

  let params: Array<[string, string]> = [];
  try {
    params = [...new URL(req.url, location.href).searchParams];
  } catch {
    /* relative URL without base */
  }

  return (
    <div className="ndt-detail">
      <div className="ndt-detail-head">
        <button type="button" className="ndt-btn" onClick={onBack}><IconArrowLeft /> Back</button>
        <span className="ndt-detail-title" title={req.url}>
          <MethodBadge method={req.method} /> {host}{path}<span className="ndt-muted">{query}</span>
        </span>
        <CopySplitButton entry={entry} onViewCurl={() => setShowCurl((s) => !s)} />
      </div>
      <div className="ndt-summary">
        {summary} · {entry.origin === 'server' ? 'Server' : 'Client'}
      </div>

      {showCurl && (
        <div className="ndt-curl-pop">
          <pre className="ndt-code" tabIndex={0}>{command(entry, 'curl')}</pre>
          <button type="button" className="ndt-btn" onClick={() => copy(entry, 'curl')}>Copy</button>
          <button type="button" className="ndt-btn" onClick={() => setShowCurl(false)}>Close</button>
        </div>
      )}

      <div className="ndt-subtabs" role="tablist">
        {(['headers', 'payload', 'response', 'timing'] as Sub[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={sub === s} onClick={() => setSub(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="ndt-detail-body">
        {sub === 'headers' && (
          <>
            <Accordion title="General" defaultOpen>
              <KV
                rows={[
                  ['URL', <span key="u" className="ndt-wrap-anywhere">{req.url}</span>],
                  ['Method', req.method],
                  ['Status', res ? `${res.status} ${res.statusText}` : '—'],
                  ['Origin', entry.origin],
                  ['Started', new Date(req.timestamp).toLocaleTimeString()],
                ]}
              />
            </Accordion>
            <Accordion title="Request Headers" count={Object.keys(req.headers).length} defaultOpen>
              <HeaderList headers={req.headers} />
            </Accordion>
            <Accordion title="Response Headers" count={Object.keys(res?.headers ?? {}).length}>
              <HeaderList headers={res?.headers ?? {}} />
            </Accordion>
          </>
        )}

        {sub === 'payload' && (
          <>
            {params.length > 0 && (
              <Accordion title="Query String" count={params.length} defaultOpen>
                <KV rows={params} />
              </Accordion>
            )}
            {req.bodyForm ? (
              <Accordion title="Form Data" count={req.bodyForm.length} defaultOpen>
                <dl className="ndt-kv ndt-mono">
                  {req.bodyForm.map(([k, v], i) => (
                    <React.Fragment key={`${k}-${i}`}>
                      <dt>{k}</dt>
                      <dd><MaskedValue name={k} value={v} /></dd>
                    </React.Fragment>
                  ))}
                </dl>
              </Accordion>
            ) : req.bodyNote ? (
              <div className="ndt-empty-inline">{req.bodyNote}</div>
            ) : req.body ? (
              <BodyViewer key={`${entry.id}-req`} body={req.body} contentType={req.headers['content-type']} size={req.body.length} filename="request" />
            ) : (
              <div className="ndt-empty-inline">No request payload</div>
            )}
          </>
        )}

        {sub === 'response' &&
          (res ? (
            <BodyViewer
              key={`${entry.id}-res-${res.status}`}
              body={res.body}
              encoding={res.bodyEncoding}
              contentType={res.contentType}
              size={res.size}
              truncated={res.bodyTruncated}
              filename="response"
            />
          ) : (
            <div className="ndt-empty-inline">{entry.state === 'pending' ? 'Waiting for response…' : entry.error ?? 'No response'}</div>
          ))}

        {sub === 'timing' && <Timing entry={entry} />}
      </div>
    </div>
  );
}

function Timing({ entry }: { entry: NetworkEntry }) {
  const res = entry.response;
  if (!res) return <div className="ndt-empty-inline">Timing is available once the request finishes.</div>;
  const total = Math.max(res.durationMs, 0.001);
  const rows: Array<[string, number | undefined, string]> = [
    ['Waiting (TTFB)', res.ttfbMs, 'tone-info'],
    ['Content download', res.downloadMs, 'tone-success'],
  ];
  let offset = 0;
  return (
    <div className="ndt-timing">
      {rows.map(([label, ms, tone]) => {
        if (ms == null) return null;
        const left = (offset / total) * 100;
        offset += ms;
        return (
          <div className="ndt-timing-row" key={label}>
            <span>{label}</span>
            <span className="ndt-timing-track">
              <span className={`ndt-timing-bar ${tone}`} style={{ left: `${left}%`, width: `${Math.max((ms / total) * 100, 1)}%` }} />
            </span>
            <span className="ndt-tnum">{formatDuration(ms)}</span>
          </div>
        );
      })}
      <div className="ndt-timing-row">
        <strong>Total</strong>
        <span />
        <strong className="ndt-tnum">{formatDuration(res.durationMs)}</strong>
      </div>
      <p className="ndt-muted">
        Queued / request-sent phases are not measurable from {entry.origin === 'server' ? 'the server' : 'a fetch wrapper'}.
      </p>
    </div>
  );
}
