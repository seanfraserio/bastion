import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const pkg = require_("../package.json") as { version: string };

describe("bastion --version", () => {
  let program: Command;
  let output: string;

  beforeEach(() => {
    output = "";
    program = new Command();
    program.name("bastion").version(pkg.version);
    program.exitOverride();
    program.configureOutput({
      writeOut: (str) => { output += str; },
    });
  });

  it("reads version from package.json (not hardcoded)", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("version is 0.2.1", () => {
    expect(pkg.version).toBe("0.2.1");
  });

  it("--version outputs the package version", () => {
    try {
      program.parse(["node", "bastion", "--version"]);
    } catch {
      // Commander throws on --version after writing output
    }
    expect(output.trim()).toBe(pkg.version);
  });

  it("-V outputs the package version", () => {
    try {
      program.parse(["node", "bastion", "-V"]);
    } catch {
      // Commander throws on -V after writing output
    }
    expect(output.trim()).toBe(pkg.version);
  });
});
