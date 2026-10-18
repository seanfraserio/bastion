/**
 * Focused fixtures for the dependency-contract checker.
 *
 * These do not touch the installed tree. They prove the checker parses
 * scoped parent IDs, OR ranges, bare majors, caret/tilde, '<8' bounds,
 * and rejects a deliberately incompatible major.
 *
 * Run: node scripts/dependency-contract.fixtures.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const checker = join(process.cwd(), "scripts/dependency-contract.test.mjs");

function writeTree(dir, { manifest, lock, parents }) {
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, "pnpm-lock.yaml"), lock);
  for (const parent of parents) {
    const storeName = parent.name.startsWith("@")
      ? `${parent.name.replace("/", "+")}@${parent.version}`
      : `${parent.name}@${parent.version}`;
    const manifestDir = parent.name.startsWith("@")
      ? join(dir, "node_modules", ".pnpm", storeName, "node_modules", ...parent.name.split("/"))
      : join(dir, "node_modules", ".pnpm", storeName, "node_modules", parent.name);
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "package.json"),
      JSON.stringify({
        name: parent.name,
        version: parent.version,
        dependencies: parent.dependencies ?? {},
        optionalDependencies: parent.optionalDependencies ?? {},
        peerDependencies: parent.peerDependencies ?? {},
      }),
    );
  }
}

function run(dir) {
  return spawnSync(process.execPath, [checker], {
    cwd: dir,
    encoding: "utf8",
  });
}

const baseLock = `lockfileVersion: '9.0'

snapshots:

  '@grpc/proto-loader@0.8.0':
    dependencies:
      protobufjs: 7.6.6

  left-pad@1.0.0:
    dependencies:
      flatted: 3.4.2

  tilde-parent@1.2.3:
    dependencies:
      picomatch: 1.2.9

  caret-parent@2.0.0:
    dependencies:
      brace-expansion: 1.1.21

  or-parent@4.0.0:
    dependencies:
      semver: 4.1.0

  bare-major-parent@9.0.0:
    dependencies:
      find-my-way: 9.10.0

  peer-parent@1.0.0(extra@1.0.0):
    dependencies:
      fast-uri: 3.1.8
`;

const goodManifest = {
  name: "fixture",
  private: true,
  pnpm: {
    overrides: {
      "@grpc/proto-loader>protobufjs": ">=7.6.6 <8",
      "left-pad>flatted": ">=3.4.2",
      "tilde-parent>picomatch": "~1.2.3",
      "caret-parent>brace-expansion": "^1.1.2",
      "or-parent>semver": "3 || ^4",
      "bare-major-parent>find-my-way": "9",
      "peer-parent>fast-uri": ">=3.1.8 <4",
    },
  },
};

const goodParents = [
  { name: "@grpc/proto-loader", version: "0.8.0", dependencies: { protobufjs: "^7.0.0" } },
  { name: "left-pad", version: "1.0.0", dependencies: { flatted: ">=3.0.0" } },
  { name: "tilde-parent", version: "1.2.3", dependencies: { picomatch: "~1.2.3" } },
  { name: "caret-parent", version: "2.0.0", dependencies: { "brace-expansion": "^1.1.2" } },
  { name: "or-parent", version: "4.0.0", dependencies: { semver: "3 || ^4" } },
  { name: "bare-major-parent", version: "9.0.0", dependencies: { "find-my-way": "9" } },
  { name: "peer-parent", version: "1.0.0", peerDependencies: { "fast-uri": ">=3.1.0 <4" } },
];

const goodDir = mkdtempSync(join(tmpdir(), "dep-contract-good-"));
writeTree(goodDir, { manifest: goodManifest, lock: baseLock, parents: goodParents });
const good = run(goodDir);
assert.equal(
  good.status,
  0,
  `compatible fixture must pass\\nstdout:\\n${good.stdout}\\nstderr:\\n${good.stderr}`,
);

const badLock = baseLock.replace("protobufjs: 7.6.6", "protobufjs: 8.0.0");
const badDir = mkdtempSync(join(tmpdir(), "dep-contract-bad-"));
writeTree(badDir, { manifest: goodManifest, lock: badLock, parents: goodParents });
const bad = run(badDir);
assert.notEqual(bad.status, 0, "incompatible major must fail");
const badOutput = `${bad.stdout}\\n${bad.stderr}`;
assert.match(badOutput, /protobufjs/);
assert.match(badOutput, /8\.0\.0/);

rmSync(goodDir, { recursive: true, force: true });
rmSync(badDir, { recursive: true, force: true });
console.log("dependency-contract fixtures passed");
