import React, { useMemo, useState } from 'react';
import type { RedactRule } from '../../shared/types';
import { isSensitive } from '../../shared/utils';
import { copyText, highlight, IconCopy, MaskedValue, useFlash } from './ui';

const MAX_STR = 160;
const PAGE = 50;

interface Ctx {
  query: string;
  level: number;
  matches: Set<unknown>;
  rules: RedactRule[];
}

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => v !== null && typeof v === 'object';

/** Containers that hold a key or leaf matching `query` (these auto-expand while searching). */
function findMatches(root: unknown, query: string): Set<unknown> {
  const set = new Set<unknown>();
  if (!query) return set;
  const q = query.toLowerCase();
  const walk = (v: unknown): boolean => {
    if (!isContainer(v)) return String(v).toLowerCase().includes(q);
    let any = false;
    for (const [k, child] of Object.entries(v)) {
      const keyHit = !Array.isArray(v) && k.toLowerCase().includes(q);
      const childHit = walk(child);
      any = any || keyHit || childHit;
    }
    if (any) set.add(v);
    return any;
  };
  walk(root);
  return set;
}

function jsonPath(parent: string, key: string, isArrayItem: boolean): string {
  if (isArrayItem) return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}['${key.replace(/'/g, "\\'")}']`;
}

function Primitive({ name, value, path, ctx }: { name?: string; value: unknown; path: string; ctx: Ctx }) {
  const [full, setFull] = useState(false);
  const [copied, flash] = useFlash(1200);
  const isStr = typeof value === 'string';
  const str = isStr ? (value as string) : String(value);
  const cls = isStr ? 'jt-str' : typeof value === 'number' ? 'jt-num' : 'jt-lit';
  const sensitive = name !== undefined && isSensitive(name, ctx.rules);
  const long = isStr && str.length > MAX_STR;
  const shown = long && !full ? `${str.slice(0, MAX_STR)}…` : str;

  const copy = async (text: string) => {
    if (await copyText(text)) flash();
  };

  return (
    <div
      className="jt-line"
      onContextMenu={(e) => {
        e.preventDefault();
        void copy(path);
      }}
      title="Click value to copy · right-click to copy JSONPath"
    >
      {name !== undefined && <span className="jt-key">{highlight(name, ctx.query)}</span>}
      {name !== undefined && <span className="jt-punc">: </span>}
      <span className={cls}>
        {sensitive ? (
          <MaskedValue name={name!} value={isStr ? `"${str}"` : str} />
        ) : (
          <span className="jt-val" onClick={() => copy(str)}>
            {isStr ? '"' : ''}
            {highlight(shown, ctx.query)}
            {isStr ? '"' : ''}
          </span>
        )}
      </span>
      {long && (
        <button type="button" className="ndt-link" onClick={() => setFull(!full)}>
          {full ? 'Show less' : `Show more (${str.length} chars)`}
        </button>
      )}
      <button type="button" className="jt-copy" aria-label="Copy value" onClick={() => copy(str)}>
        {copied ? '✓' : <IconCopy />}
      </button>
    </div>
  );
}

function Node({ name, value, path, depth, ctx, isArrayItem }: { name?: string; value: unknown; path: string; depth: number; ctx: Ctx; isArrayItem?: boolean }) {
  const [open, setOpen] = useState(depth < ctx.level);
  const [limit, setLimit] = useState(PAGE);

  if (!isContainer(value)) return <Primitive name={name} value={value} path={path} ctx={ctx} />;

  const isArr = Array.isArray(value);
  const entries = Object.entries(value);
  const forced = ctx.matches.has(value);
  const isOpen = forced || open;
  const preview = entries.length === 0 ? (isArr ? '[]' : '{}') : isArr ? `[ ${entries.length} items ]` : `{ ${entries.length} keys }`;

  return (
    <div className="jt-node">
      <div className="jt-line" onContextMenu={(e) => { e.preventDefault(); void copyText(path); }}>
        <button type="button" className="jt-toggle" aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)}>
          {isOpen ? '▾' : '▸'}
        </button>
        {name !== undefined && <span className="jt-key">{highlight(name, ctx.query)}</span>}
        {name !== undefined && <span className="jt-punc">: </span>}
        {!isOpen && <span className="jt-preview" onClick={() => setOpen(true)}>{preview}</span>}
        {isOpen && <span className="jt-punc">{isArr ? '[' : '{'}</span>}
      </div>
      {isOpen && (
        <div className="jt-children">
          {entries.slice(0, limit).map(([k, v]) => (
            <Node key={k} name={isArr ? undefined : k} value={v} path={jsonPath(path, k, isArr)} depth={depth + 1} ctx={ctx} isArrayItem={isArr} />
          ))}
          {entries.length > limit && (
            <button type="button" className="ndt-link" onClick={() => setLimit(limit + PAGE)}>
              Show next {Math.min(PAGE, entries.length - limit)} ({entries.length - limit} remaining)
            </button>
          )}
          <span className="jt-punc">{isArr ? ']' : '}'}</span>
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value, query, level, epoch, rules }: { value: unknown; query: string; level: number; epoch: number; rules: RedactRule[] }) {
  const matches = useMemo(() => findMatches(value, query), [value, query]);
  const ctx: Ctx = { query, level, matches, rules };
  // `key={epoch}` remounts the tree so Expand all / Collapse all / Level N reset every node.
  return (
    <div className="jt" key={epoch}>
      <Node value={value} path="$" depth={0} ctx={ctx} />
    </div>
  );
}
