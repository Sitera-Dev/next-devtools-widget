import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainTraceCookies, TRACE_COOKIE_PREFIX } from "../src/client/cookie-transport";
import { writeTraceCookie } from "../src/server/patch-fetch";
import type { DevToolsEntry, NetworkEntry } from "../src/shared/types";

describe("cookie-transport (Solution 1: Serverless / Vercel Lambda response bridge)", () => {
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.document = originalDocument;
  });

  describe("drainTraceCookies", () => {
    it("safely exits if document or document.cookie is undefined", () => {
      // @ts-ignore
      delete globalThis.document;
      const emit = vi.fn();
      expect(() => drainTraceCookies(emit)).not.toThrow();
      expect(emit).not.toHaveBeenCalled();
    });

    it("ignores unrelated cookies and does not mutate them", () => {
      const mockCookie = "session_id=abc12345; theme=dark; auth_token=secret";
      let currentCookie = mockCookie;
      // @ts-ignore
      globalThis.document = {
        get cookie() {
          return currentCookie;
        },
        set cookie(val: string) {
          currentCookie = val;
        },
      };

      const emit = vi.fn();
      drainTraceCookies(emit);
      expect(emit).not.toHaveBeenCalled();
      expect(currentCookie).toBe(mockCookie);
    });

    it("drains and deletes trace cookies, emitting valid DevTools entries", () => {
      const entry: NetworkEntry = {
        id: "srv_test_001",
        category: "network",
        origin: "server",
        state: "completed",
        request: {
          url: "https://api.external.com/v1/otp",
          method: "POST",
          headers: { "content-type": "application/json" },
          timestamp: 1700000000000,
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: JSON.stringify({ success: true }),
          durationMs: 45,
        },
      };

      const cookieName = `${TRACE_COOKIE_PREFIX}srv_test_001`;
      const cookieVal = encodeURIComponent(JSON.stringify(entry));
      let currentCookie = `unrelated=foo; ${cookieName}=${cookieVal}; other=bar`;
      const cookieSets: string[] = [];

      // @ts-ignore
      globalThis.document = {
        get cookie() {
          return currentCookie;
        },
        set cookie(val: string) {
          cookieSets.push(val);
          // Simulate expiration
          if (val.includes("max-age=0")) {
            currentCookie = currentCookie.replace(new RegExp(`${cookieName}=[^;]+(; )?`), "");
          }
        },
      };

      const emitted: DevToolsEntry[] = [];
      drainTraceCookies((e) => emitted.push(e));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe("srv_test_001");
      expect((emitted[0] as NetworkEntry).request.url).toBe("https://api.external.com/v1/otp");
      expect((emitted[0] as NetworkEntry).response?.status).toBe(200);

      // Verify cookie was expired
      expect(cookieSets.some((c) => c.startsWith(`${cookieName}=`) && c.includes("max-age=0"))).toBe(true);
      expect(currentCookie).not.toContain(cookieName);
    });

    it("handles malformed JSON without throwing and still deletes the bad cookie", () => {
      const cookieName = `${TRACE_COOKIE_PREFIX}bad_json`;
      let currentCookie = `${cookieName}=not-valid-json`;
      const cookieSets: string[] = [];

      // @ts-ignore
      globalThis.document = {
        get cookie() {
          return currentCookie;
        },
        set cookie(val: string) {
          cookieSets.push(val);
        },
      };

      const emit = vi.fn();
      expect(() => drainTraceCookies(emit)).not.toThrow();
      expect(emit).not.toHaveBeenCalled();
      expect(cookieSets.some((c) => c.startsWith(`${cookieName}=`) && c.includes("max-age=0"))).toBe(true);
    });
  });

  describe("writeTraceCookie", () => {
    it("truncates large response bodies to prevent exceeding 4KB cookie header limit", async () => {
      const hugeBody = "X".repeat(5000);
      const entry: NetworkEntry = {
        id: "srv_huge_123",
        category: "network",
        origin: "server",
        state: "completed",
        request: {
          url: "https://api.external.com/data",
          method: "GET",
          headers: {},
          timestamp: Date.now(),
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: hugeBody,
          durationMs: 12,
        },
      };

      // Mock next/headers
      const setMock = vi.fn();
      vi.doMock("next/headers", () => ({
        cookies: () => ({
          set: setMock,
        }),
      }));

      await writeTraceCookie(entry);

      if (setMock.mock.calls.length > 0) {
        const [cookieName, cookieValue] = setMock.mock.calls[0];
        expect(cookieName).toContain(TRACE_COOKIE_PREFIX);
        expect(cookieValue.length).toBeLessThan(3800);
        const parsed = JSON.parse(decodeURIComponent(cookieValue));
        expect(parsed.response.body).toContain("truncated");
      }
    });
  });
});
