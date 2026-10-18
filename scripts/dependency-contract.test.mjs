/**
 * Dependency override contract.
 *
 * Parent-scoped overrides must resolve inside the installed parent's declared
 * range and inside the override range. Bare overrides must not pull a
 * different major than the versions already selected in the lockfile, and
 * every selected version must satisfy the override range.
 *
 * Run: node scripts/dependency-contract.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import semver from "semver";

const root = process.cwd();
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const overrides = rootManifest.pnpm?.overrides ?? {};
const lock = yaml.load(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
const store = join(root, "node_modules", ".pnpm");

assert.equal(typeof lock, "object", "lockfile did not parse");
assert.equal(typeof lock.snapshots, "object", "lockfile snapshots missing");

function cleanVersion(value) {
  return String(value).replace(/\([^)]*\)/g, "").trim();
}

function splitPackageId(id) {
  const cleaned = cleanVersion(id);
  const at = cleaned.lastIndexOf("@");
  // Scoped names contain a leading @. A version is only present when @
  // appears after the name, as in @scope/name@1.2.3.
  if (at <= 0) return { name: cleaned, version: "" };
  return { name: cleaned.slice(0, at), version: cleaned.slice(at + 1) };
}

function satisfies(version, range) {
  const cleaned = cleanVersion(version);
  if (!semver.valid(cleaned)) return false;
  return semver.satisfies(cleaned, String(range), { includePrerelease: true });
}

function installedManifest(parentName, parentVersion) {
  assert.ok(existsSync(store), "pnpm store missing; install before this check");
  const prefix = parentName.startsWith("@")
    ? `${parentName.replace("/", "+")}@${parentVersion}`
    : `${parentName}@${parentVersion}`;
  const entries = readdirSync(store).filter(
    (entry) => entry === prefix || entry.startsWith(`${prefix}_`),
  );
  assert.ok(entries.length > 0, `installed parent not found: ${prefix}`);
  for (const entry of entries) {
    const manifestPath = parentName.startsWith("@")
      ? join(store, entry, "node_modules", ...parentName.split("/"), "package.json")
      : join(store, entry, "node_modules", parentName, "package.json");
    if (existsSync(manifestPath)) return JSON.parse(readFileSync(manifestPath, "utf8"));
  }
  assert.fail(`manifest missing for ${prefix}`);
}

function declaredRange(parentName, parentVersion, depName) {
  const manifest = installedManifest(parentName, parentVersion);
  const range =
    manifest.dependencies?.[depName] ??
    manifest.optionalDependencies?.[depName] ??
    manifest.peerDependencies?.[depName];
  assert.ok(range, `${parentName}@${parentVersion} does not declare ${depName}`);
  return range;
}

function parentSelectorMatches(header, parentSelector) {
  const { name, version } = splitPackageId(header);
  const wanted = splitPackageId(parentSelector);
  if (wanted.version) return name === wanted.name && version.startsWith(wanted.version);
  return name === wanted.name;
}

function dependencyVersion(block, depName) {
  for (const field of ["dependencies", "optionalDependencies"]) {
    const value = block?.[field]?.[depName];
    if (value !== undefined && value !== null) return cleanVersion(value);
  }
  return null;
}

function snapshotVersions(depName) {
  const versions = [];
  for (const header of Object.keys(lock.snapshots)) {
    const { name, version } = splitPackageId(header);
    if (name === depName) versions.push(version);
  }
  return versions;
}

const failures = [];
const bareForbidden = ["protobufjs", "fast-uri", "brace-expansion", "picomatch", "cookie"];

for (const name of bareForbidden) {
  if (Object.prototype.hasOwnProperty.call(overrides, name)) {
    failures.push(`bare override ${name} can force a newer major into older parents`);
  }
}

for (const [selector, range] of Object.entries(overrides)) {
  assert.equal(typeof range, "string", `override ${selector} is not a string range`);
  try {
    semver.validRange(range);
  } catch (err) {
    failures.push(`override ${selector} has an unparsable range ${range}: ${err.message}`);
    continue;
  }
  if (semver.validRange(range) === null) {
    failures.push(`override ${selector} has an unparsable range ${range}`);
    continue;
  }

  const childAt = selector.lastIndexOf(">");
  if (childAt === -1) {
    const versions = snapshotVersions(selector);
    if (versions.length === 0) {
      failures.push(`lockfile has no resolution for ${selector}`);
      continue;
    }
    const majors = new Set(versions.map((version) => semver.major(version)));
    if (majors.size > 1) {
      failures.push(
        `bare override ${selector}@${range} resolved multiple majors: ${[...majors].join(", ")}`,
      );
    }
    for (const version of versions) {
      if (!satisfies(version, range)) {
        failures.push(`${selector} resolved ${version}, outside ${range}`);
      }
    }
    continue;
  }

  const parentSelector = selector.slice(0, childAt);
  const depName = selector.slice(childAt + 1);
  const matches = Object.entries(lock.snapshots).filter(([header, block]) => {
    return parentSelectorMatches(header, parentSelector) && dependencyVersion(block, depName);
  });
  if (matches.length === 0) {
    failures.push(`lockfile has no resolution for ${selector}`);
    continue;
  }
  for (const [header, block] of matches) {
    const version = dependencyVersion(block, depName);
    const { name: parentName, version: parentVersion } = splitPackageId(header);
    const declared = declaredRange(parentName, parentVersion, depName);
    if (!satisfies(version, declared)) {
      failures.push(
        `${parentName}@${parentVersion} declares ${depName}@${declared} but resolved ${version} via ${selector}`,
      );
    }
    if (!satisfies(version, range)) {
      failures.push(`${selector} resolved ${version}, outside ${range}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`contract: ${failure}`);
  process.exit(1);
}

console.log(`dependency contract ok (${Object.keys(overrides).length} overrides)`);
