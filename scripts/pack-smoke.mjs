/**
 * Pack workspace packages and fail if a published tarball is missing a
 * declared entry, still points types at source, or still contains a
 * workspace:* dependency.
 *
 * Default packer is pnpm so the packed manifest is the release manifest
 * (workspace protocol rewritten). BASTION_PACK_COMMAND=npm uses npm pack
 * --json for isolated fixtures that are not a pnpm workspace. No registry
 * publish.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.BASTION_PACK_ROOT
  ? process.env.BASTION_PACK_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = process.env.BASTION_PACK_PACKAGES
  ? process.env.BASTION_PACK_PACKAGES.split(",").filter(Boolean)
  : ["config", "proxy", "sdk", "cli"];
const packCommand = process.env.BASTION_PACK_COMMAND === "npm" ? "npm" : "pnpm";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function declaredEntries(manifest) {
  const entries = new Set();
  for (const field of ["main", "module", "types"]) {
    if (typeof manifest[field] === "string") entries.add(manifest[field]);
  }
  if (manifest.bin && typeof manifest.bin === "object") {
    for (const target of Object.values(manifest.bin)) {
      if (typeof target === "string") entries.add(target);
    }
  } else if (typeof manifest.bin === "string") {
    entries.add(manifest.bin);
  }
  collectExportTargets(manifest.exports, entries);
  return [...entries];
}

function collectExportTargets(value, entries) {
  if (typeof value === "string") {
    entries.add(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const target of Object.values(value)) collectExportTargets(target, entries);
}

function workspaceDeps(manifest) {
  const hits = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec.startsWith("workspace:")) {
        hits.push(`${field}.${name}=${spec}`);
      }
    }
  }
  return hits;
}

function npmPacked(dir) {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });
  const packed = JSON.parse(raw)[0];
  return {
    files: new Set((packed.files ?? []).map((file) => file.path)),
    manifest: readJson(join(dir, "package.json")),
  };
}

function pnpmPacked(dir, sourceManifest) {
  const packDir = mkdtempSync(join(tmpdir(), "bastion-pack-"));
  try {
    execFileSync("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const packedName = `${sourceManifest.name.replace("@", "").replace("/", "-")}-${sourceManifest.version}.tgz`;
    const tarball = join(packDir, packedName);
    const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" });
    const files = new Set(
      listing
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^package\//, "")),
    );
    const packedManifest = JSON.parse(
      execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
    );
    return { files, manifest: packedManifest };
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
}

let failed = false;

for (const name of packages) {
  const dir = join(root, "packages", name);
  const sourceManifest = readJson(join(dir, "package.json"));
  let packed;
  try {
    packed = packCommand === "npm" ? npmPacked(dir) : pnpmPacked(dir, sourceManifest);
  } catch (err) {
    failed = true;
    const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    console.error(`${sourceManifest.name}: ${packCommand} pack failed ${stderr || err.message}`);
    continue;
  }

  const entries = declaredEntries(packed.manifest);
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.startsWith(".")) continue;
    const rel = entry.replace(/^\.\//, "");
    if (entry.includes("/src/")) {
      console.error(`${packed.manifest.name}: published entry points at source (${entry})`);
      failed = true;
    }
    if (!packed.files.has(rel)) {
      console.error(`${packed.manifest.name}: packed tarball missing ${rel}`);
      failed = true;
    }
  }

  const leaked = workspaceDeps(packed.manifest);
  if (leaked.length > 0) {
    console.error(`${packed.manifest.name}: packed manifest still has workspace protocol (${leaked.join(", ")})`);
    failed = true;
  }

  if (!failed) {
    console.log(
      `${packed.manifest.name}: pack includes ${entries.length} declared entries (${packed.files.size} files, deps rewritten)`,
    );
  }
}

if (failed) process.exit(1);
