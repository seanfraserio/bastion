/**
 * Install the current packed workspace tarballs into a temp consumer and
 * prove the CLI bin starts and the config package resolves from both CJS
 * and TypeScript. No registry publish.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const stage = mkdtempSync(join(tmpdir(), "bastion-pack-consumer-"));
const tarballs = join(stage, "tarballs");
mkdirSync(tarballs);

const packages = ["config", "proxy", "sdk", "cli"];
const packed = {};
try {
  for (const name of packages) {
    const dir = join(root, "packages", name);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    execFileSync("pnpm", ["pack", "--pack-destination", tarballs], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    packed[name] = join(
      tarballs,
      `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
    );
    const published = JSON.parse(
      execFileSync("tar", ["-xOzf", packed[name], "package/package.json"], { encoding: "utf8" }),
    );
    const deps = published.dependencies ?? {};
    for (const [dep, spec] of Object.entries(deps)) {
      if (String(spec).startsWith("workspace:")) {
        throw new Error(`${manifest.name} still publishes ${dep}@${spec}`);
      }
    }
    console.log(`${manifest.name} published deps: ${JSON.stringify(deps)}`);
  }

  const consumer = join(stage, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({
    name: "bastion-pack-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@openbastion-ai/config": `file:${packed.config}`,
      "@openbastion-ai/cli": `file:${packed.cli}`,
      "@openbastion-ai/proxy": `file:${packed.proxy}`,
      "@openbastion-ai/sdk": `file:${packed.sdk}`,
    },
  }, null, 2));
  execFileSync("pnpm", ["install", "--ignore-scripts"], {
    cwd: consumer,
    stdio: "inherit",
  });

  const cjs = execFileSync(process.execPath, ["-e", "const c=require('@openbastion-ai/config'); if (typeof c.loadConfig !== 'function') process.exit(2); console.log('cjs config ok')"], {
    cwd: consumer,
    encoding: "utf8",
  });
  console.log(cjs.trim());

  const bin = execFileSync(process.execPath, [join(consumer, "node_modules/@openbastion-ai/cli/dist/index.cjs"), "--help"], {
    cwd: consumer,
    encoding: "utf8",
  });
  if (!bin.includes("bastion")) {
    throw new Error(`CLI bin did not print help:\n${bin}`);
  }
  console.log("cli bin ok");

  writeFileSync(join(consumer, "consume.ts"), "import { loadConfig } from \"@openbastion-ai/config\";\nexport const kind = typeof loadConfig;\n");
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "nodenext",
      moduleResolution: "nodenext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ["consume.ts"],
  }, null, 2));
  execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log("external typescript consumer ok");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
