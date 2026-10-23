import { defineConfig } from 'tsup';

const common = {
  format: ['esm', 'cjs'] as ('esm' | 'cjs')[],
  dts: true,
  sourcemap: true,
  clean: false, // dist is wiped by the `build` script (two parallel configs would race)
  target: 'es2020',
  external: ['next', 'react', 'react-dom', 'react/jsx-runtime'],
  minify: false,
};

export default defineConfig([
  {
    ...common,
    entry: { index: 'src/index.ts' },
    // The widget is a Client Component; esbuild strips module directives, so re-add it.
    banner: { js: "'use client';" },
  },
  {
    ...common,
    entry: {
      server: 'src/server/index.ts',
      'server/route': 'src/server/route-handler.ts',
    },
  },
  {
    format: ['cjs'],
    target: 'node18',
    entry: { cli: 'src/cli.ts' },
    banner: { js: '#!/usr/bin/env node' },
    clean: false,
    minify: false,
    dts: false,
  },
]);
