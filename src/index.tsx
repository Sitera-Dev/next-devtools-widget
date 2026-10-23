import React, { Suspense } from "react";
import {
  NextDevToolsClient,
  type NextDevToolsProps,
} from "./client";
import { waitForSsrTraces } from "./server/ssr-store";

async function SsrCollector(props: NextDevToolsProps) {
  let tracesPayload = "";
  if (typeof window === "undefined") {
    try {
      let isCleared = false;
      try {
        const nextHeaders = await import("next/headers");
        if (nextHeaders && typeof nextHeaders.cookies === "function") {
          const cookieJar = await Promise.resolve(nextHeaders.cookies());
          if (cookieJar && cookieJar.get("__ndt_clear")?.value === "1") {
            isCleared = true;
          }
        }
      } catch {}

      const traces = await waitForSsrTraces(1500);
      if (!isCleared && traces && traces.length > 0) {
        tracesPayload = JSON.stringify(traces).replace(/</g, "\\u003c");
      }
    } catch {
      // ignore
    }
  }

  return (
    <>
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

export function NextDevTools(props: NextDevToolsProps) {
  const isEnabled =
    props.enabled ??
    (process.env.NODE_ENV === "development" ||
      process.env.NEXT_DEVTOOLS_ENABLED === "true" ||
      process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true");

  if (!isEnabled) return null;

  return (
    <Suspense fallback={<NextDevToolsClient {...props} />}>
      <SsrCollector {...props} />
    </Suspense>
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
