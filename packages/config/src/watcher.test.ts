import { describe, it, expect, vi, afterEach } from "vitest";
import { watchConfig } from "./watcher.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("watchConfig", () => {
  let cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // ignore cleanup errors
      }
    }
    cleanups = [];
  });

  it("returns a cleanup function", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bastion-watcher-"));
    const tmpFile = path.join(tmpDir, "test.yaml");
    fs.writeFileSync(tmpFile, "version: 1\n");

    const cleanup = watchConfig(tmpFile, vi.fn());
    cleanups.push(cleanup);

    expect(typeof cleanup).toBe("function");

    // Tidy up
    fs.unlinkSync(tmpFile);
    fs.rmdirSync(tmpDir);
  });

  it("cleanup function can be called without error", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bastion-watcher-"));
    const tmpFile = path.join(tmpDir, "test.yaml");
    fs.writeFileSync(tmpFile, "version: 1\n");

    const cleanup = watchConfig(tmpFile, vi.fn());

    expect(() => cleanup()).not.toThrow();

    // Tidy up
    fs.unlinkSync(tmpFile);
    fs.rmdirSync(tmpDir);
  });
});
