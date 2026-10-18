import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import yaml from "js-yaml";

const workflow = yaml.load(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
const job = workflow.jobs["build-and-test"];
const steps = job.steps;

for (const command of [
  "node scripts/dependency-contract.fixtures.test.mjs",
  "node scripts/dependency-contract.test.mjs",
  "node scripts/run-pack-smoke-test.mjs",
  "node scripts/pack-consumer-smoke.mjs",
]) {
  test(`CI enforces ${command}`, () => {
    const step = steps.find((step) => step.run?.split("\n").some((line) => line.trim() === command));
    assert.ok(step, `missing blocking CI command: ${command}`);
    assert.notEqual(step["continue-on-error"], true);
    assert.notEqual(job["continue-on-error"], true);
    if (command.includes("pack-")) {
      const build = steps.findIndex((step) => step.run?.trim() === "pnpm build");
      assert.ok(build >= 0 && steps.indexOf(step) > build, "packed checks must follow the build");
    }
  });
}

test("CI enforces its own contract-wiring regression", () => {
  assert.ok(steps.some((step) => step.run === "node --test scripts/ci-contract.test.mjs"));
});
