import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/cli';

describe('next-devtools init CLI', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-devtools-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds route.ts and instrumentation.ts in a TypeScript project with src/app', () => {
    // Setup mock Next.js project structure
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'app', 'layout.tsx'),
      'export default function RootLayout({ children }) { return <html><body>{children}</body></html>; }',
    );

    const res = runInit({ cwd: tmpDir, silent: true });

    expect(res.success).toBe(true);
    expect(res.isTypeScript).toBe(true);
    expect(res.hasSrc).toBe(true);
    expect(res.routeCreated).toBe(true);
    expect(res.instrumentationCreated).toBe(true);

    const routePath = path.join(tmpDir, 'src', 'app', 'api', 'next-devtools', 'sse', 'route.ts');
    expect(fs.existsSync(routePath)).toBe(true);
    expect(fs.readFileSync(routePath, 'utf8')).toContain("export { GET } from 'next-devtools-widget/server/route'");

    const instrPath = path.join(tmpDir, 'src', 'instrumentation.ts');
    expect(fs.existsSync(instrPath)).toBe(true);
    expect(fs.readFileSync(instrPath, 'utf8')).toContain('registerNextDevTools()');

    // Running again should be idempotent
    const res2 = runInit({ cwd: tmpDir, silent: true });
    expect(res2.routeCreated).toBe(false);
    expect(res2.instrumentationCreated).toBe(false);
  });

  it('updates existing instrumentation.ts if registerNextDevTools is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
    const instrPath = path.join(tmpDir, 'instrumentation.ts');
    fs.writeFileSync(
      instrPath,
      'export async function register() {\n  console.log("Existing setup");\n}\n',
    );

    const res = runInit({ cwd: tmpDir, silent: true });

    expect(res.instrumentationCreated).toBe(false);
    expect(res.instrumentationUpdated).toBe(true);

    const updated = fs.readFileSync(instrPath, 'utf8');
    expect(updated).toContain('Existing setup');
    expect(updated).toContain('registerNextDevTools()');
  });

  it('generates .js files when tsconfig.json is absent', () => {
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });

    const res = runInit({ cwd: tmpDir, silent: true });

    expect(res.isTypeScript).toBe(false);
    const routePath = path.join(tmpDir, 'app', 'api', 'next-devtools', 'sse', 'route.js');
    expect(fs.existsSync(routePath)).toBe(true);

    const instrPath = path.join(tmpDir, 'instrumentation.js');
    expect(fs.existsSync(instrPath)).toBe(true);
  });
});
