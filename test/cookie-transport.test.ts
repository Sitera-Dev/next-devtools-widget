import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainTraceCookies, parseCookieValue, TRACE_COOKIE_PREFIX } from "../src/client/cookie-transport";
import { encodeTracePayload, writeTraceCookie } from "../src/server/patch-fetch";
import type { DevToolsEntry, NetworkEntry } from "../src/shared/types";

describe("cookie-transport (Serverless / Vercel Lambda response bridge with Deflate compression)", () => {
  let originalDocument: typeof globalThis.document;

  beforeEach(() => {
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.document = originalDocument;
  });

  describe("parseCookieValue and encodeTracePayload", () => {
    const sampleEntry: NetworkEntry = {
      id: "srv_sample_456",
      category: "network",
      origin: "server",
      state: "completed",
      request: {
        url: "https://api.external.com/v1/auth/login",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ msisdn: "08123456789" }),
        timestamp: 1700000000000,
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ success: true, token: "jwt_dummy_token_abcdef123456" }),
        durationMs: 85,
      },
    };

    it("encodes with deflate (z:) and successfully decodes via parseCookieValue", async () => {
      const encoded = encodeTracePayload(sampleEntry);
      expect(encoded.startsWith("z:") || encoded.startsWith("b:")).toBe(true);
      const decoded = await parseCookieValue(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe("srv_sample_456");
      expect((decoded as NetworkEntry).request.url).toBe("https://api.external.com/v1/auth/login");
      expect((decoded as NetworkEntry).response?.body).toContain("jwt_dummy_token_abcdef123456");
    });

    it("parses legacy URI-encoded format for backward compatibility", async () => {
      const uriEncoded = encodeURIComponent(JSON.stringify(sampleEntry));
      const decoded = await parseCookieValue(uriEncoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe("srv_sample_456");
    });

    it("returns null for malformed cookie value", async () => {
      const decoded = await parseCookieValue("z:invalid_base64_garbage!@#$");
      expect(decoded).toBeNull();
    });
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

    it("drains and deletes trace cookies, emitting valid DevTools entries", async () => {
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
      const cookieVal = encodeTracePayload(entry);
      let currentCookie = `unrelated=foo; ${cookieName}=${cookieVal}; other=bar`;
      const cookieSets: string[] = [];

      // @ts-ignore
      globalThis.document = {
        get cookie() {
          return currentCookie;
        },
        set cookie(val: string) {
          cookieSets.push(val);
          if (val.includes("max-age=0")) {
            currentCookie = currentCookie.replace(new RegExp(`${cookieName}=[^;]+(; )?`), "");
          }
        },
      };

      const emitted: DevToolsEntry[] = [];
      drainTraceCookies((e) => emitted.push(e));

      // Wait a tick for async decompression if z: was used
      await new Promise((r) => setTimeout(r, 20));

      expect(emitted).toHaveLength(1);
      expect(emitted[0].id).toBe("srv_test_001");
      expect((emitted[0] as NetworkEntry).request.url).toBe("https://api.external.com/v1/otp");
      expect((emitted[0] as NetworkEntry).response?.status).toBe(200);

      // Verify cookie was expired immediately
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
    it("truncates very large response bodies to prevent exceeding 4KB cookie limit", async () => {
      const hugeBody = "X".repeat(10000);
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
        const parsed = await parseCookieValue(cookieValue);
        expect((parsed as NetworkEntry).response?.body).toContain("truncated");
      }
    });
  });
});
