import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts/pack-smoke.mjs");

function runChecker(root, packages) {
  return execFileSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      BASTION_PACK_ROOT: root,
      BASTION_PACK_PACKAGES: packages.join(","),
      BASTION_PACK_COMMAND: "npm",
    },
  });
}

function writePackage(root, name, manifest, files) {
  const dir = join(root, "packages", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, contents] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, contents);
  }
}

function expectFailure(root, packages, pattern) {
  try {
    const output = runChecker(root, packages);
    assert.fail(`expected failure matching ${pattern}, got success:\n${output}`);
  } catch (err) {
    if (err && err.name === "AssertionError") throw err;
    const output = `${err.stderr ?? ""}\n${err.stdout ?? ""}`;
    assert.match(output, pattern);
    assert.equal(err.status, 1);
  }
}

const root = mkdtempSync(join(tmpdir(), "bastion-pack-smoke-"));
try {
  writePackage(root, "cli", {
    name: "@example/cli",
    version: "0.0.0",
    main: "./dist/index.js",
    module: "./dist/index.mjs",
    types: "./dist/index.d.ts",
    bin: { bastion: "./dist/index.cjs" },
    exports: {
      ".": {
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    },
    dependencies: {
      "@example/config": "workspace:*",
    },
  }, {
    "dist/index.js": "module.exports = {};\n",
    "dist/index.mjs": "export {};\n",
    "dist/index.d.ts": "export {};\n",
  });

  expectFailure(root, ["cli"], /@example\/cli: packed tarball missing dist\/index\.cjs/);
  expectFailure(root, ["cli"], /packed manifest still has workspace protocol/);
  console.log("pack-smoke regression: missing declared bin and workspace protocol failed as expected");

  writePackage(root, "cli", {
    name: "@example/cli",
    version: "0.0.0",
    main: "./dist/index.js",
    module: "./dist/index.mjs",
    types: "./dist/index.d.ts",
    bin: { bastion: "./dist/index.cjs" },
    exports: {
      ".": {
        types: "./src/index.ts",
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    },
  }, {
    "dist/index.js": "module.exports = {};\n",
    "dist/index.mjs": "export {};\n",
    "dist/index.cjs": "#!/usr/bin/env node\nmodule.exports = {};\n",
    "dist/index.d.ts": "export {};\n",
    "src/index.ts": "export {};\n",
  });
  expectFailure(root, ["cli"], /published entry points at source \(\.\/src\/index\.ts\)/);
  console.log("pack-smoke regression: source types entry failed as expected");

  writePackage(root, "lib", {
    name: "@example/lib",
    version: "0.0.0",
    main: "./dist/index.js",
    module: "./dist/index.mjs",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    },
  }, {
    "dist/index.js": "module.exports = {};\n",
    "dist/index.mjs": "export {};\n",
    "dist/index.d.ts": "export {};\n",
  });
  const ok = runChecker(root, ["lib"]);
  assert.match(ok, /@example\/lib: pack includes/);
  console.log("pack-smoke regression: complete declared contract passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
