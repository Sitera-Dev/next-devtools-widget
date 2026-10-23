import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BodyEncoding } from '../../shared/types';
import { formatBytes, redactValue } from '../../shared/utils';
import { JsonTree } from './json-tree';
import {
  CopyButton,
  downloadText,
  highlight,
  IconDownload,
  IconExpand,
  IconSearch,
  IconWrap,
  IconX,
  useRedact,
} from './ui';

const LARGE = 256 * 1024; // render Raw lazily in chunks beyond this
const HUGE = 2 * 1024 * 1024; // do not render at all beyond this
const CHUNK = 256 * 1024;

type Mode = 'tree' | 'raw' | 'preview';

export interface BodyViewerProps {
  body: string | null | undefined;
  encoding?: BodyEncoding;
  contentType?: string;
  size?: number;
  truncated?: boolean;
  filename: string;
}

const PLACEHOLDER = /^\[(binary|event stream|Body too large|Unreadable stream)/;

function extFor(ct: string, json: boolean): string {
  if (json || /json/i.test(ct)) return 'json';
  if (/html/i.test(ct)) return 'html';
  if (/xml/i.test(ct)) return 'xml';
  if (/^image\/([\w+-]+)/i.test(ct)) return RegExp.$1.replace('svg+xml', 'svg');
  if (/^text\//i.test(ct)) return 'txt';
  return 'bin';
}

export function BodyViewer({ body, encoding, contentType = '', size, truncated, filename }: BodyViewerProps) {
  const rules = useRedact();
  const [mode, setMode] = useState<Mode | null>(null);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [level, setLevel] = useState(1);
  const [epoch, setEpoch] = useState(0);
  const [visible, setVisible] = useState(CHUNK);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const text = encoding === 'base64' ? '' : body ?? '';
  const isPlaceholder = !!body && body.length < 300 && PLACEHOLDER.test(body);
  const huge = text.length > HUGE;

  const json = useMemo<{ value: unknown } | null>(() => {
    if (encoding === 'base64' || isPlaceholder || huge || !text) return null;
    const t = text.trimStart();
    if (!/json/i.test(contentType) && t[0] !== '{' && t[0] !== '[') return null;
    try {
      return { value: JSON.parse(text) };
    } catch {
      return null;
    }
  }, [text, contentType, encoding, isPlaceholder, huge]);

  const effectiveMode: Mode = mode ?? (json ? 'tree' : 'raw');

  const { shownText, hasSecrets } = useMemo(() => {
    if (!json) return { shownText: text, hasSecrets: false };
    const plain = JSON.stringify(json.value, null, 2);
    const masked = JSON.stringify(redactValue(json.value, rules, '••••••••'), null, 2);
    return { shownText: reveal ? plain : masked, hasSecrets: plain !== masked };
  }, [json, text, rules, reveal]);

  // In-body search: count <mark> nodes in the DOM so Tree and Raw share one implementation.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !query) return setCount(0);
    const marks = root.querySelectorAll('mark');
    setCount(marks.length);
    const idx = marks.length ? Math.min(active, marks.length - 1) : 0;
    marks.forEach((m, i) => m.classList.toggle('active', i === idx));
    marks[idx]?.scrollIntoView({ block: 'nearest' });
  }, [query, active, effectiveMode, shownText, visible, level, epoch, wrap, expanded]);

  if (body == null || (body === '' && encoding !== 'base64')) {
    return <div className="ndt-empty-inline">No body</div>;
  }

  const mime = contentType.split(';')[0] || 'application/octet-stream';
  const download = () =>
    encoding === 'base64'
      ? downloadText(`${filename}.${extFor(contentType, false)}`, body, mime, true)
      : downloadText(`${filename}.${extFor(contentType, !!json)}`, body, mime);

  // ---- binary & placeholders ----
  if (encoding === 'base64') {
    const isImage = /^image\//i.test(contentType);
    return (
      <div className="ndt-body">
        <div className="ndt-body-bar">
          <span className="ndt-muted">[binary · {mime} · {formatBytes(size)}]</span>
          <span className="ndt-spacer" />
          <button type="button" className="ndt-btn" onClick={download}><IconDownload /> Download</button>
        </div>
        {isImage && (
          <div className="ndt-body-scroll ndt-preview">
            <img src={`data:${mime};base64,${body}`} alt="Response preview" />
          </div>
        )}
      </div>
    );
  }
  if (isPlaceholder) return <div className="ndt-empty-inline">{body}</div>;

  if (huge) {
    return (
      <div className="ndt-body">
        <div className="ndt-body-bar">
          <span className="ndt-muted">{formatBytes(text.length)} — too large to render safely</span>
          <span className="ndt-spacer" />
          <button type="button" className="ndt-btn" onClick={download}><IconDownload /> Download full body</button>
        </div>
      </div>
    );
  }

  const modes: Mode[] = json ? ['tree', 'raw', 'preview'] : ['raw', 'preview'];
  const lazy = shownText.length > LARGE;
  const rawText = lazy ? shownText.slice(0, visible) : shownText;
  const lines = effectiveMode === 'raw' ? rawText.split('\n') : [];

  const bump = () => setEpoch((e) => e + 1);

  const preview = () => {
    if (/html/i.test(contentType)) return <iframe className="ndt-iframe" title="HTML preview" sandbox="" srcDoc={text} />;
    if (/^image\/svg/i.test(contentType)) return <img src={`data:${mime};utf8,${encodeURIComponent(text)}`} alt="SVG preview" />;
    return <div className="ndt-empty-inline">No visual preview for {mime || 'this content type'}. Use Tree or Raw.</div>;
  };

  return (
    <div
      className="ndt-body"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setSearchOpen(true);
        }
      }}
    >
      <div className="ndt-body-bar">
        <div className="ndt-seg" role="tablist" aria-label="View mode">
          {modes.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={effectiveMode === m} onClick={() => setMode(m)}>
              {m === 'tree' ? 'Tree' : m === 'raw' ? 'Raw' : 'Preview'}
            </button>
          ))}
        </div>
        <span className="ndt-spacer" />
        {effectiveMode === 'tree' && (
          <>
            <button type="button" className="ndt-btn" onClick={() => { setLevel(1e9); bump(); }}>Expand all</button>
            <button type="button" className="ndt-btn" onClick={() => { setLevel(0); bump(); }}>Collapse</button>
            <select className="ndt-select" aria-label="Expand to level" value={level >= 1e9 || level === 0 ? '' : level} onChange={(e) => { setLevel(Number(e.target.value)); bump(); }}>
              <option value="" disabled>Level…</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n}</option>)}
            </select>
          </>
        )}
        {hasSecrets && (
          <button type="button" className="ndt-btn" onClick={() => setReveal(!reveal)}>{reveal ? 'Mask' : 'Reveal'} secrets</button>
        )}
        <button type="button" className="ndt-btn" aria-label="Search in body (Ctrl+F)" title="Search (Ctrl/Cmd+F)" onClick={() => setSearchOpen(!searchOpen)}><IconSearch /></button>
        {effectiveMode === 'raw' && (
          <button type="button" className="ndt-btn" aria-pressed={wrap} title="Soft wrap" onClick={() => setWrap(!wrap)}><IconWrap /> Wrap</button>
        )}
        <CopyButton getText={() => text} />
        <button type="button" className="ndt-btn" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><IconExpand /> {expanded ? 'Collapse' : 'Expand'}</button>
        <button type="button" className="ndt-btn" onClick={download} aria-label="Download body"><IconDownload /></button>
      </div>

      {searchOpen && (
        <div className="ndt-body-search">
          <input
            autoFocus
            className="ndt-input"
            placeholder="Find in body…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (count) setActive((a) => (e.shiftKey ? (a - 1 + count) % count : (a + 1) % count));
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                setSearchOpen(false);
                setQuery('');
              }
            }}
          />
          <span className="ndt-muted ndt-tnum" aria-live="polite">{query ? `${count ? Math.min(active, count - 1) + 1 : 0}/${count}` : ''}</span>
          <button type="button" className="ndt-icon-btn" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}><IconX /></button>
        </div>
      )}

      {truncated && <div className="ndt-note">Body truncated at 10MB.</div>}

      <div ref={scrollRef} className={`ndt-body-scroll ${expanded ? 'is-expanded' : ''}`}>
        {effectiveMode === 'tree' && json && (
          <JsonTree value={json.value} query={query} level={level} epoch={epoch} rules={reveal ? [] : rules} />
        )}
        {effectiveMode === 'raw' && (
          <div className={`ndt-raw ${wrap ? 'wrap' : ''}`}>
            {lines.map((l, i) => (
              <div className="ndt-raw-line" key={i}>
                <span className="ndt-ln">{i + 1}</span>
                <span className="ndt-lt">{query ? highlight(l, query) : l || ' '}</span>
              </div>
            ))}
            {lazy && visible < shownText.length && (
              <button type="button" className="ndt-btn" onClick={() => setVisible(visible + CHUNK)}>
                Load more ({formatBytes(shownText.length - visible)} remaining)
              </button>
            )}
          </div>
        )}
        {effectiveMode === 'preview' && <div className="ndt-preview">{preview()}</div>}
      </div>
    </div>
  );
}
