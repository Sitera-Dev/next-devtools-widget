import { describe, expect, it } from 'vitest';
import { buildCurl, buildFetchSnippet, bashQuote } from '../src/client/components/curl-generator';
import type { NetworkRequestInfo } from '../src/shared/types';

const req = (over: Partial<NetworkRequestInfo> = {}): NetworkRequestInfo => ({
  url: 'https://api.example.com/v1/claim',
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer abc', host: 'x', 'sec-fetch-mode': 'cors' },
  body: '{"voucherId":"v_123"}',
  timestamp: 0,
  ...over,
});

describe('curl generator', () => {
  it('builds a bash command, skipping browser-managed headers', () => {
    const out = buildCurl(req());
    expect(out).toBe(
      [
        "curl 'https://api.example.com/v1/claim' \\",
        '  -X POST \\',
        "  -H 'content-type: application/json' \\",
        "  -H 'authorization: Bearer abc' \\",
        `  --data-raw '{"voucherId":"v_123"}' \\`,
        '  --compressed',
      ].join('\n'),
    );
  });

  it('omits -X for GET and uses -I for HEAD', () => {
    expect(buildCurl(req({ method: 'GET', body: null }))).not.toContain('-X');
    expect(buildCurl(req({ method: 'HEAD', body: null }))).toContain('-I');
  });

  it('escapes single quotes and uses $\'…\' for newlines', () => {
    expect(bashQuote("it's")).toBe(`'it'\\''s'`);
    expect(bashQuote('a\nb')).toBe("$'a\\nb'");
    expect(bashQuote("é 'x'\n")).toBe("$'é \\'x\\'\\n'");
  });

  it('keeps unicode intact', () => {
    expect(buildCurl(req({ body: '{"name":"Rúslan 🚀"}' }))).toContain('Rúslan 🚀');
  });

  it('drops cookie unless opted in', () => {
    const r = req({ headers: { cookie: 'a=b' } });
    expect(buildCurl(r)).not.toContain('cookie');
    expect(buildCurl(r, 'bash', { includeCookie: true })).toContain("'cookie: a=b'");
  });

  it('redacts secrets in headers and JSON bodies', () => {
    const out = buildCurl(req({ body: '{"password":"hunter2","ok":1}' }), 'bash', { redact: ['authorization', /password/i] });
    expect(out).not.toContain('Bearer abc');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('<REDACTED>');
  });

  it('supports cmd and PowerShell flavors', () => {
    expect(buildCurl(req(), 'cmd')).toContain('^\n');
    expect(buildCurl(req({ body: "it's" }), 'powershell')).toContain("-Body 'it''s'");
  });

  it('uses -F for FormData and notes omitted binary bodies', () => {
    const form = buildCurl(req({ body: null, bodyForm: [['a', 'b']] }));
    expect(form).toContain("-F 'a=b'");
    expect(form).not.toContain('content-type');
    expect(buildCurl(req({ body: null, bodyNote: '[binary body omitted]' }))).toMatch(/^# binary body omitted/);
  });

  it('generates a fetch snippet', () => {
    expect(buildFetchSnippet(req())).toContain('"method": "POST"');
  });
});
