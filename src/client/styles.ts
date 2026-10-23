/** CSS injected into the Shadow DOM root. Nothing here can leak to the host page, and vice versa. */
export const DEVTOOLS_ISOLATED_CSS = `
:host {
  --radius: 0.5rem;
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 40%;
  --border: 240 5.9% 90%;
  --ring: 240 5% 54%;
  --success: 142 71% 30%;
  --warning: 32 92% 36%;
  --destructive: 0 72% 46%;
  --info: 217 91% 48%;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  color-scheme: light;
}
:host([data-theme='dark']) {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 68%;
  --border: 240 3.7% 20%;
  --ring: 240 5% 64.9%;
  --success: 142 71% 48%;
  --warning: 38 92% 58%;
  --destructive: 0 80% 66%;
  --info: 217 91% 68%;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
.ndt-root { font: 12px/1.45 var(--font-sans); color: hsl(var(--foreground)); pointer-events: none; }
.ndt-root button, .ndt-root input, .ndt-root select { font: inherit; color: inherit; }
.ndt-root :focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
.ndt-mono { font-family: var(--font-mono); }
.ndt-muted { color: hsl(var(--muted-foreground)); }
.ndt-tnum { font-variant-numeric: tabular-nums; }
.ndt-spacer { flex: 1; }
.ndt-wrap-anywhere { overflow-wrap: anywhere; }
.tone-success { color: hsl(var(--success)); }
.tone-info { color: hsl(var(--info)); }
.tone-warning { color: hsl(var(--warning)); }
.tone-destructive, .tone-destructive-text { color: hsl(var(--destructive)); }
.tone-muted { color: hsl(var(--muted-foreground)); }

/* ---------- trigger button ---------- */
.ndt-pill {
  position: fixed; left: 0; top: 0; width: 36px; height: 36px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 1px solid hsl(var(--border));
  background: hsl(var(--background) / 0.92); backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12), 0 1px 2px hsl(0 0% 0% / 0.08);
  pointer-events: auto; cursor: grab; opacity: 0.85; user-select: none; touch-action: none;
  color: hsl(var(--foreground));
  transition: transform 160ms ease-out, opacity 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out;
}
.ndt-pill.no-anim { transition: none; }
.ndt-pill:hover, .ndt-pill:focus-visible, .ndt-pill.is-open {
  opacity: 1;
  border-color: hsl(var(--ring) / 0.5);
  box-shadow: 0 4px 14px hsl(0 0% 0% / 0.2);
}
.ndt-pill.is-dragging { transition: none; cursor: grabbing; opacity: 1; }
.ndt-logo { display: inline-block; vertical-align: middle; flex-shrink: 0; }
@keyframes ndt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ---------- panel ---------- */
.ndt-panel {
  position: fixed; display: flex; flex-direction: column; pointer-events: auto; overflow: hidden;
  background: hsl(var(--background)); border: 1px solid hsl(var(--border));
  border-radius: var(--radius); box-shadow: 0 1px 3px hsl(0 0% 0% / 0.08); outline: none;
}
.ndt-header { height: 36px; flex: none; display: flex; align-items: stretch; gap: 4px; padding: 0 4px 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-brand { display: flex; align-items: center; padding: 0 4px 0 2px; color: hsl(var(--foreground)); flex: none; opacity: 0.85; }
.ndt-tabs { display: flex; gap: 2px; flex: 1; min-width: 0; }
.ndt-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0 8px; cursor: pointer; color: hsl(var(--muted-foreground)); font-size: 13px; }
.ndt-tabs button[aria-selected='true'] { color: hsl(var(--foreground)); border-bottom-color: hsl(var(--foreground)); }
.ndt-tabs button:hover { color: hsl(var(--foreground)); }
.ndt-header-actions { display: flex; align-items: center; gap: 2px; }
.ndt-main { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
.ndt-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; }
.ndt-scroll { overflow: auto; padding: 8px; }
.ndt-grip { position: absolute; width: 14px; height: 14px; z-index: 3; touch-action: none; opacity: 0.5; }
.ndt-grip:hover { opacity: 1; }
.ndt-grip::after { content: ''; position: absolute; inset: 3px; border: 0 solid hsl(var(--muted-foreground)); }
.grip-tl { top: 0; left: 0; cursor: nwse-resize; } .grip-tl::after { border-top-width: 1.5px; border-left-width: 1.5px; }
.grip-tr { top: 0; right: 0; cursor: nesw-resize; } .grip-tr::after { border-top-width: 1.5px; border-right-width: 1.5px; }
.grip-bl { bottom: 0; left: 0; cursor: nesw-resize; } .grip-bl::after { border-bottom-width: 1.5px; border-left-width: 1.5px; }
.grip-br { bottom: 0; right: 0; cursor: nwse-resize; } .grip-br::after { border-bottom-width: 1.5px; border-right-width: 1.5px; }

/* ---------- controls ---------- */
.ndt-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: none; border: 0; border-radius: 6px; cursor: pointer; color: hsl(var(--muted-foreground)); align-self: center; }
.ndt-icon-btn:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.ndt-btn { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; background: transparent; border: 1px solid hsl(var(--border)); border-radius: 6px; cursor: pointer; font-size: 11px; white-space: nowrap; }
.ndt-btn:hover { background: hsl(var(--muted)); }
.ndt-btn[aria-pressed='true'] { background: hsl(var(--muted)); }
.ndt-link { background: none; border: 0; padding: 0 2px; cursor: pointer; color: hsl(var(--info)); font-size: inherit; text-decoration: underline; }
.ndt-input { background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; min-width: 0; flex: 1; height: 24px; }
.ndt-input:hover { border-color: hsl(var(--border)); }
.ndt-select { height: 24px; background: transparent; border: 1px solid hsl(var(--border)); border-radius: 6px; padding: 0 4px; }
.ndt-select option { background: hsl(var(--background)); color: hsl(var(--foreground)); }
.ndt-seg { display: inline-flex; border: 1px solid hsl(var(--border)); border-radius: 6px; overflow: hidden; flex: none; }
.ndt-seg button { background: none; border: 0; padding: 0 8px; height: 22px; cursor: pointer; font-size: 11px; color: hsl(var(--muted-foreground)); }
.ndt-seg button + button { border-left: 1px solid hsl(var(--border)); }
.ndt-seg button[aria-pressed='true'], .ndt-seg button[aria-selected='true'] { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.ndt-toolbar { height: 32px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-search { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; color: hsl(var(--muted-foreground)); }
.ndt-search .ndt-input { color: hsl(var(--foreground)); }

/* ---------- list ---------- */
.ndt-vlist { flex: 1; min-height: 0; overflow: auto; position: relative; }
.ndt-vrow { position: absolute; left: 0; right: 0; }
.ndt-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; color: hsl(var(--muted-foreground)); }
.ndt-empty-inline { padding: 10px 8px; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ndt-row { position: relative; height: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) 38px 52px 52px; gap: 6px; align-items: center; padding: 0 8px; font-family: var(--font-mono); cursor: pointer; border-bottom: 1px solid hsl(var(--border) / 0.5); }
.ndt-row-simple { grid-template-columns: minmax(0, 1fr) 52px 56px; }
.ndt-row:hover { background: hsl(var(--muted) / 0.7); }
.ndt-row.is-selected { background: hsl(var(--muted)); }
.ndt-row-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ndt-row-num { text-align: right; color: hsl(var(--muted-foreground)); }
.ndt-origin { display: inline-block; margin-right: 4px; padding: 0 3px; font-size: 9px; border: 1px solid hsl(var(--border)); border-radius: 3px; color: hsl(var(--muted-foreground)); }
.ndt-row-copy { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; height: 20px; padding: 0 6px; font-size: 10px; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 4px; cursor: pointer; }
.ndt-row:hover .ndt-row-copy, .ndt-row-copy:focus-visible { display: block; }
.ndt-wf { position: absolute; left: 0; bottom: 0; height: 2px; background: hsl(var(--info) / 0.6); }
.ndt-method { font-weight: 600; font-size: 11px; }
.ndt-status { font-family: var(--font-mono); font-weight: 500; text-align: right; }
.ndt-split-pane { flex: 1; min-height: 0; display: grid; grid-template-columns: 35% 65%; }
.ndt-pane-list { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid hsl(var(--border)); }
.ndt-pane-detail { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.ndt-pane-list .ndt-row { grid-template-columns: 44px minmax(0, 1fr) 38px 52px; }
.ndt-pane-list .ndt-row-num:last-of-type { display: none; }

/* ---------- detail ---------- */
.ndt-detail { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ndt-detail-head { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-detail-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.ndt-summary { padding: 4px 8px; font-size: 11px; color: hsl(var(--muted-foreground)); border-bottom: 1px solid hsl(var(--border)); overflow-wrap: anywhere; }
.ndt-subtabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-subtabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 5px 8px; cursor: pointer; color: hsl(var(--muted-foreground)); }
.ndt-subtabs button[aria-selected='true'] { color: hsl(var(--foreground)); border-bottom-color: hsl(var(--foreground)); }
.ndt-detail-body { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.ndt-kv { display: grid; grid-template-columns: minmax(80px, 30%) minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: 11px; }
.ndt-kv dt { color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.ndt-kv dd { margin: 0; overflow-wrap: anywhere; }
.ndt-acc + .ndt-acc { margin-top: 4px; }
.ndt-acc-head { display: flex; align-items: center; gap: 4px; width: 100%; background: none; border: 0; padding: 4px 0; cursor: pointer; font-weight: 600; text-align: left; }
.ndt-acc-body { padding: 2px 0 6px 16px; }
.ndt-h { margin: 8px 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: hsl(var(--muted-foreground)); }
.ndt-group + .ndt-group { margin-top: 8px; }
.ndt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ndt-chip { padding: 1px 6px; border: 1px solid hsl(var(--border)); border-radius: 4px; font-family: var(--font-mono); font-size: 11px; }
.ndt-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ndt-timeline li { display: flex; gap: 8px; align-items: center; }
.ndt-code { margin: 0; padding: 6px 8px; background: hsl(var(--muted)); border-radius: 6px; font-family: var(--font-mono); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; flex: 1; }
.ndt-curl-pop { display: flex; gap: 6px; align-items: flex-start; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-mem { display: inline-flex; align-items: center; gap: 8px; }
.ndt-mem-bar { width: 80px; height: 6px; background: hsl(var(--muted)); border-radius: 3px; overflow: hidden; }
.ndt-mem-bar > span { display: block; height: 100%; background: hsl(var(--info)); }
.ndt-timing { display: grid; gap: 6px; }
.ndt-timing-row { display: grid; grid-template-columns: 120px 1fr 56px; gap: 8px; align-items: center; }
.ndt-timing-row .ndt-tnum { text-align: right; }
.ndt-timing-track { position: relative; height: 8px; background: hsl(var(--muted)); border-radius: 4px; overflow: hidden; }
.ndt-timing-bar { position: absolute; top: 0; bottom: 0; background: currentColor; border-radius: 4px; }

/* ---------- split button / menus ---------- */
.ndt-split { position: relative; display: inline-flex; flex: none; }
.ndt-split > .ndt-btn:first-child { border-radius: 6px 0 0 6px; }
.ndt-split-caret { border-radius: 0 6px 6px 0; border-left: 0; padding: 0 4px; }
.ndt-menu, .ndt-ctx { position: absolute; z-index: 6; min-width: 190px; display: flex; flex-direction: column; padding: 4px; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 6px; box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12); }
.ndt-menu { right: 0; top: 100%; margin-top: 2px; }
.ndt-ctx { position: fixed; pointer-events: auto; }
.ndt-menu button, .ndt-ctx button { text-align: left; background: none; border: 0; padding: 5px 8px; border-radius: 4px; cursor: pointer; }
.ndt-menu button:hover, .ndt-ctx button:hover { background: hsl(var(--muted)); }
.ndt-menu-check { display: flex; gap: 6px; align-items: center; padding: 5px 8px; cursor: pointer; border-top: 1px solid hsl(var(--border)); margin-top: 4px; }
.ndt-ctx-sep { height: 1px; background: hsl(var(--border)); margin: 4px 0; }
.ndt-toast { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 7; padding: 6px 10px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--background)); box-shadow: 0 2px 8px hsl(0 0% 0% / 0.12); }
.ndt-toast:empty { display: none; }

/* ---------- body viewer ---------- */
.ndt-body { border: 1px solid hsl(var(--border)); border-radius: 6px; margin-top: 6px; overflow: hidden; outline: none; }
.ndt-body-bar { position: sticky; top: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 4px; background: hsl(var(--muted) / 0.6); border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-search { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-search .ndt-input { border-color: hsl(var(--border)); }
.ndt-note { padding: 4px 8px; color: hsl(var(--warning)); border-bottom: 1px solid hsl(var(--border)); }
.ndt-body-scroll { max-height: 240px; overflow: auto; padding: 6px 8px; }
.ndt-body-scroll.is-expanded { max-height: none; }
.ndt-preview img { max-width: 100%; }
.ndt-iframe { width: 100%; height: 220px; border: 1px solid hsl(var(--border)); background: #fff; }
.ndt-raw { font-family: var(--font-mono); font-size: 11px; }
.ndt-raw-line { display: flex; gap: 8px; }
.ndt-ln { flex: none; min-width: 4ch; text-align: right; color: hsl(var(--muted-foreground)); user-select: none; }
.ndt-lt { white-space: pre; }
.ndt-raw.wrap .ndt-lt { white-space: pre-wrap; overflow-wrap: anywhere; }
mark { background: hsl(var(--warning) / 0.35); color: inherit; border-radius: 2px; }
mark.active { background: hsl(var(--warning) / 0.85); color: hsl(var(--background)); }

/* ---------- JSON tree ---------- */
.jt { font-family: var(--font-mono); font-size: 11px; line-height: 1.6; }
.jt-children { margin-left: 12px; padding-left: 8px; border-left: 1px solid hsl(var(--border)); }
.jt-line { display: flex; flex-wrap: wrap; align-items: baseline; position: relative; }
.jt-toggle { background: none; border: 0; padding: 0 4px 0 0; cursor: pointer; color: hsl(var(--muted-foreground)); width: 14px; }
.jt-key { color: hsl(var(--info)); }
.jt-punc { color: hsl(var(--muted-foreground)); white-space: pre; }
.jt-str { color: hsl(var(--success)); }
.jt-num { color: hsl(var(--warning)); }
.jt-lit { color: hsl(var(--destructive)); }
.jt-val { cursor: pointer; overflow-wrap: anywhere; }
.jt-preview { color: hsl(var(--muted-foreground)); cursor: pointer; }
.jt-copy { background: none; border: 0; padding: 0 4px; cursor: pointer; opacity: 0; color: hsl(var(--muted-foreground)); }
.jt-line:hover .jt-copy, .jt-copy:focus-visible { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
