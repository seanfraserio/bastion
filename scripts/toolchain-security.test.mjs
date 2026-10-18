import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import yaml from "js-yaml";
import semver from "semver";

const manifest = (path) => JSON.parse(readFileSync(path, "utf8"));
const root = manifest("package.json");
const manifests = [root, ...readdirSync("packages").map((name) => manifest(`packages/${name}/package.json`))];
for (const pkg of manifests) {
  assert.ok(semver.subset(pkg.devDependencies.vitest, ">=4.1.11 <5"), `${pkg.name}: patched Node-20-compatible Vitest 4 required`);
}
assert.equal(root.devDependencies["@vitest/coverage-v8"], root.devDependencies.vitest);
const lock = yaml.load(readFileSync("pnpm-lock.yaml", "utf8"));
const floors = { vitest: "4.1.11", "@vitest/mocker": "4.1.11", vite: "7.3.7", postcss: "8.5.23", "source-map-js": "1.2.2", nanoid: "3.3.18", tinypool: "2.1.2" };
for (const [id, metadata] of Object.entries(lock.packages)) {
  // Check the changed development tools, not inherited production packages.
  if (/^(?:vitest|@vitest\/[^@]+|vite|tsup|eslint|@typescript-eslint\/[^@]+|esbuild)@/.test(id) && metadata.engines?.node) {
    assert.ok(semver.satisfies("20.20.2", metadata.engines.node), `${id}: must support the verified Node 20 development runtime`);
  }
  const at = id.lastIndexOf("@");
  const name = id.slice(0, at);
  const version = id.slice(at + 1);
  if (floors[name]) assert.ok(semver.gte(version, floors[name]), `${id}: below security floor ${floors[name]}`);
  assert.notEqual(name, "braces", "unpatched braces must be removed through compatible parent updates");
}
for (const pkg of manifests.slice(1)) {
  assert.ok(!pkg.engines?.node || semver.satisfies("20.0.0", pkg.engines.node), `${pkg.name}: published runtime minimum must remain Node 20`);
}
const ci = yaml.load(readFileSync(".github/workflows/ci.yml", "utf8"));
const steps = ci.jobs["build-and-test"].steps;
const audit = steps.find((step) => step.name === "Security audit");
assert.equal(audit?.run, "pnpm audit --audit-level=high", "CI must fail on critical/high development findings");
assert.notEqual(audit?.["continue-on-error"], true);
assert.ok(steps.some((step) => step.run === "node scripts/toolchain-security.test.mjs"), "CI must enforce the toolchain security contract");
console.log("toolchain security contracts ok");
