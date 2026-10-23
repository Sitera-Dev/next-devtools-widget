import React from 'react';

type RedactRule = string | RegExp;

type TabId = 'network' | 'actions' | 'cache' | 'system';
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type Theme = 'light' | 'dark' | 'system';

interface NextDevToolsProps {
    /** Initial corner. A user drag wins (and is remembered) after the first interaction. */
    position?: Corner;
    theme?: Theme;
    defaultOpen?: boolean;
    /** e.g. `alt+d`, `ctrl+shift+k` */
    hotkey?: string;
    /** Ring buffer size kept in the browser. */
    maxEntries?: number;
    /** Header / JSON field names (string = exact, RegExp = pattern) masked in the UI. */
    redact?: RedactRule[];
    tabs?: TabId[];
    /** Defaults to `process.env.NODE_ENV === 'development'`. */
    enabled?: boolean;
}
declare function NextDevTools({ position, theme, defaultOpen, hotkey, maxEntries, redact, tabs, enabled, }: NextDevToolsProps): React.JSX.Element | null;

export { NextDevTools, NextDevTools as NextDevToolsClient, type NextDevToolsProps };
