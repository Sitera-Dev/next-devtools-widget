import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RedactRule } from '../../shared/types';
import { DEFAULT_REDACT, isSensitive } from '../../shared/utils';

// ---------------- context ----------------

export const RedactContext = createContext<RedactRule[]>(DEFAULT_REDACT);
export const useRedact = () => useContext(RedactContext);

// ---------------- clipboard ----------------

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  // Non-HTTPS dev hosts: hidden textarea + execCommand.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function downloadText(filename: string, content: string, mime = 'text/plain', base64 = false): void {
  let blob: Blob;
  if (base64) {
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = new Blob([content], { type: mime });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- hooks ----------------

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
}

/** Briefly flips to `true` after `flash()` (used for the `Copied ✓` label). */
export function useFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return [
    on,
    () => {
      setOn(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setOn(false), ms);
    },
  ];
}

// ---------------- icons (Lucide-style, inline, 14px / 1.5 stroke) ----------------

const I = (d: React.ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
export const IconLogo = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`ndt-logo ${className ?? ''}`}
    aria-hidden="true"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M9 9v-1a3 3 0 0 1 6 0v1" />
    <path d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1 -10 0v-3a6 6 0 0 1 1 -3" />
    <path d="M3 13l4 0" />
    <path d="M17 13l4 0" />
    <path d="M12 20l0 -6" />
    <path d="M4 19l3.35 -2" />
    <path d="M20 19l-3.35 -2" />
    <path d="M4 7l3.75 2.4" />
    <path d="M20 7l-3.75 2.4" />
  </svg>
);
export const IconSearch = () => I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconX = () => I(<path d="M18 6 6 18M6 6l12 12" />);
export const IconMaximize = () => I(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);
export const IconMinimize = () => I(<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />);
export const IconTrash = () => I(<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />);
export const IconCopy = () => I(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>);
export const IconCheck = () => I(<path d="m5 12 5 5L20 7" />);
export const IconChevronRight = () => I(<path d="m9 6 6 6-6 6" />, 12);
export const IconChevronDown = () => I(<path d="m6 9 6 6 6-6" />, 12);
export const IconArrowLeft = () => I(<path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconDownload = () => I(<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />);
export const IconWrap = () => I(<path d="M3 6h18M3 12h14a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M3 18h6" />);
export const IconExpand = () => I(<path d="M7 8l5-5 5 5M7 16l5 5 5-5" />);

// ---------------- primitives ----------------

export function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const { label, children, className, ...rest } = props;
  return (
    <button type="button" className={`ndt-icon-btn ${className ?? ''}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function CopyButton({ getText, label = 'Copy', className }: { getText: () => string; label?: string; className?: string }) {
  const [done, flash] = useFlash();
  return (
    <button
      type="button"
      className={`ndt-btn ${className ?? ''}`}
      onClick={async () => {
        if (await copyText(getText())) flash();
      }}
    >
      {done ? <IconCheck /> : <IconCopy />}
      <span aria-live="polite">{done ? 'Copied ✓' : label}</span>
    </button>
  );
}

/** Masks sensitive values with a per-value Reveal toggle. */
export function MaskedValue({ name, value }: { name: string; value: string }) {
  const rules = useRedact();
  const [shown, setShown] = useState(false);
  if (!isSensitive(name, rules)) return <>{value}</>;
  return (
    <>
      {shown ? value : '••••••••'}{' '}
      <button type="button" className="ndt-link" onClick={() => setShown((s) => !s)}>
        {shown ? 'Hide' : 'Reveal'}
      </button>
    </>
  );
}

export function Accordion({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ndt-acc">
      <button type="button" className="ndt-acc-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <IconChevronDown /> : <IconChevronRight />}
        <span>{title}</span>
        {count != null && <span className="ndt-muted">({count})</span>}
      </button>
      {open && <div className="ndt-acc-body">{children}</div>}
    </section>
  );
}

export function KV({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="ndt-kv">
      {rows.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function statusTone(status: number | undefined, state?: string): 'success' | 'info' | 'warning' | 'destructive' | 'muted' {
  if (state === 'pending') return 'muted';
  if (state === 'failed' || !status) return 'destructive';
  if (status >= 500) return 'destructive';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  return 'success';
}

export function methodTone(method: string): 'info' | 'success' | 'warning' | 'destructive' | 'muted' {
  switch (method) {
    case 'GET':
      return 'info';
    case 'POST':
      return 'success';
    case 'PUT':
    case 'PATCH':
      return 'warning';
    case 'DELETE':
      return 'destructive';
    default:
      return 'muted';
  }
}

/** Highlights case-insensitive `query` matches with <mark>. */
export function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let n = 0;
  for (;;) {
    const at = lower.indexOf(q, i);
    if (at < 0) break;
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={n++}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  if (!out.length) return text;
  if (i < text.length) out.push(text.slice(i));
  return out;
}
