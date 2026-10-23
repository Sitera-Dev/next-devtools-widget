import React from "react";
import {
  NextDevToolsClient,
  type NextDevToolsProps,
} from "./client";
import { waitForSsrTraces } from "./server/ssr-store";

export interface UnifiedNextDevToolsProps extends NextDevToolsProps {
  children?: React.ReactNode;
}

export async function NextDevTools({
  children,
  ...props
}: UnifiedNextDevToolsProps) {
  const isEnabled =
    props.enabled ??
    (process.env.NODE_ENV === "development" ||
      process.env.NEXT_DEVTOOLS_ENABLED === "true" ||
      process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true");

  if (!isEnabled) {
    return children ? <>{children}</> : null;
  }

  let tracesPayload = "";
  if (typeof window === "undefined") {
    try {
      const traces = await waitForSsrTraces(1500);
      if (traces && traces.length > 0) {
        tracesPayload = JSON.stringify(traces).replace(/</g, "\\u003c");
      }
    } catch {
      // ignore
    }
  }

  return (
    <>
      {children}
      {tracesPayload ? (
        <script
          type="application/json"
          id="__next_devtools_ssr__"
          data-next-devtools-ssr=""
          dangerouslySetInnerHTML={{ __html: tracesPayload }}
        />
      ) : null}
      <NextDevToolsClient {...props} />
    </>
  );
}

export { NextDevToolsClient };
export type { NextDevToolsProps } from "./client";
export type { Corner, TabId } from "./client/components/drawer";
export type {
  DevToolsEntry,
  NetworkEntry,
  ActionEntry,
  CacheEntry,
  SystemInfo,
  RedactRule,
} from "./shared/types";
export {
  drainTraceCookies,
  drainSsrTraces,
  setupSsrObserver,
} from "./client";
