import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSsrTraces, recordSsrTrace, trackInFlightFetch, waitForSsrTraces } from "../src/server/ssr-store";
import { drainSsrTraces, setupSsrObserver, SSR_SCRIPT_ID } from "../src/client/ssr-drainer";
import type { DevToolsEntry, NetworkEntry } from "../src/shared/types";

describe("SSR Capture & Synchronization", () => {
  beforeEach(() => {
    clearSsrTraces();
    vi.restoreAllMocks();
  });

  describe("ssr-store", () => {
    it("buffers recent server traces up to the limit", async () => {
      for (let i = 0; i < 60; i++) {
        recordSsrTrace({
          id: `srv_${i}`,
          category: "network",
          origin: "server",
          state: "completed",
          request: {
            url: `https://api.test/items/${i}`,
            method: "GET",
            headers: {},
            timestamp: Date.now(),
          },
        });
      }

      const traces = await waitForSsrTraces(0);
      expect(traces).toHaveLength(50);
    });

    it("awaits active in-flight fetches before returning traces", async () => {
      let finishFetch!: () => void;
      const fetchPromise = new Promise<void>((resolve) => {
        finishFetch = resolve;
      });

      trackInFlightFetch(fetchPromise);

      const entry: NetworkEntry = {
        id: "srv_async_1",
        category: "network",
        origin: "server",
        state: "completed",
        request: {
          url: "https://api.test/async",
          method: "GET",
          headers: {},
          timestamp: Date.now(),
        },
      };

      // Simulate fetch completing after 50ms
      setTimeout(() => {
        recordSsrTrace(entry);
        finishFetch();
      }, 50);

      const traces = await waitForSsrTraces(500);
      expect(traces.some((t) => t.id === "srv_async_1")).toBe(true);
    });
  });

  describe("ssr-drainer", () => {
    it("reads traces from script tag and removes element from DOM", () => {
      const mockTraces: NetworkEntry[] = [
        {
          id: "srv_ssr_1",
          category: "network",
          origin: "server",
          state: "completed",
          request: {
            url: "https://api.test/catalog",
            method: "GET",
            headers: {},
            timestamp: Date.now(),
          },
        },
      ];

      const script = {
        id: SSR_SCRIPT_ID,
        textContent: JSON.stringify(mockTraces),
        remove: vi.fn(),
      };

      // @ts-ignore
      globalThis.document = {
        getElementById: vi.fn((id: string) => (id === SSR_SCRIPT_ID ? script : null)),
      };

      const emitted: DevToolsEntry[] = [];
      drainSsrTraces((e) => emitted.push(e));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe("srv_ssr_1");
      expect(script.remove).toHaveBeenCalledTimes(1);
    });

    it("observes dynamic DOM additions and drains streamed SSR scripts", () => {
      let observerCallback!: () => void;
      const disconnectMock = vi.fn();

      // @ts-ignore
      globalThis.MutationObserver = vi.fn(function (cb: () => void) {
        observerCallback = cb;
        return {
          observe: vi.fn(),
          disconnect: disconnectMock,
        };
      });

      let currentScript: any = null;
      // @ts-ignore
      globalThis.document = {
        documentElement: {},
        getElementById: vi.fn((id: string) => (id === SSR_SCRIPT_ID ? currentScript : null)),
      };

      const emitted: DevToolsEntry[] = [];
      const cleanup = setupSsrObserver((e) => emitted.push(e));

      expect(emitted).toHaveLength(0);

      // Simulate a streamed Suspense script arriving in the DOM
      currentScript = {
        id: SSR_SCRIPT_ID,
        textContent: JSON.stringify([
          {
            id: "srv_streamed_1",
            category: "network",
            origin: "server",
            state: "completed",
            request: {
              url: "https://api.test/streamed",
              method: "GET",
              headers: {},
              timestamp: Date.now(),
            },
          },
        ]),
        remove: vi.fn(() => {
          currentScript = null;
        }),
      };

      observerCallback();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe("srv_streamed_1");

      cleanup();
      expect(disconnectMock).toHaveBeenCalled();
    });
  });
});
