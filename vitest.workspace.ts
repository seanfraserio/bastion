import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/config",
  "packages/proxy",
  "packages/cli",
  "packages/sdk",
]);
