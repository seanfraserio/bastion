import * as fs from "node:fs";
import * as yaml from "js-yaml";
import { ZodError } from "zod";
import { bastionConfigSchema, type BastionConfig } from "./schema.js";

// ---------------------------------------------------------------------------
// Environment variable interpolation
// ---------------------------------------------------------------------------

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Replace every `${VAR_NAME}` token in a string with the corresponding
 * `process.env` value.  Throws if a referenced variable is not set.
 */
function interpolateEnvVars(raw: string, filePath: string): string {
  return raw.replace(ENV_VAR_PATTERN, (_match, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(
        `Environment variable "${varName}" referenced in ${filePath} is not set`,
      );
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load, interpolate, and validate a Bastion YAML configuration file.
 *
 * 1. Read the file from disk.
 * 2. Replace `${ENV_VAR}` placeholders with values from `process.env`.
 * 3. Parse the YAML into a plain object.
 * 4. Validate against the Zod schema (`bastionConfigSchema`).
 *
 * @param filePath - Absolute or relative path to the `bastion.yaml` file.
 * @returns The fully validated `BastionConfig` object.
 */
export async function loadConfig(filePath: string): Promise<BastionConfig> {
  // 1. Read raw YAML
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file at "${filePath}": ${message}`);
  }

  // 2. Interpolate environment variables
  const interpolated = interpolateEnvVars(rawContent, filePath);

  // 3. Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(interpolated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML in "${filePath}": ${message}`);
  }

  // 4. Validate with Zod
  try {
    return bastionConfigSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Invalid Bastion configuration in "${filePath}":\n${issues}`,
      );
    }
    throw err;
  }
}
