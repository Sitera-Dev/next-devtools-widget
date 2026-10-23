import { defineConfig } from "tsup";

const common = {
  format: ["esm", "cjs"] as ("esm" | "cjs")[],
  dts: true,
  sourcemap: true,
  clean: false,
  target: "es2020",
  external: ["next", /^next\/.*/, "react", "react-dom", "react/jsx-runtime"],
  minify: false,
};

export default defineConfig([
  {
    ...common,
    entry: { client: "src/client/index.ts" },
    banner: { js: "'use client';" },
  },
  {
    ...common,
    entry: { index: "src/index.tsx" },
    external: [
      ...common.external,
      "./client",
      "./client.js",
      "./client.mjs",
    ],
  },
  {
    ...common,
    entry: {
      server: "src/server/index.ts",
      "server/route": "src/server/route-handler.ts",
    },
  },
  {
    format: ["cjs"],
    target: "node18",
    entry: { cli: "src/cli.ts" },
    banner: { js: "#!/usr/bin/env node" },
    clean: false,
    minify: false,
    dts: false,
  },
]);
