import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

/**
 * tsup's CJS output is dist/index.js. The published bin is dist/index.cjs so
 * npm can execute it without treating the package as ESM ("type" is unset,
 * but an explicit .cjs extension stays unambiguous if "type" is added later).
 * The copy keeps the same shebang and module body as the CJS build.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  onSuccess: async () => {
    copyFileSync("dist/index.js", "dist/index.cjs");
  },
});
