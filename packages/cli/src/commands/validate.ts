import { Command } from "commander";
import { loadConfig } from "@openbastion-ai/config";

function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate a Bastion configuration file")
    .option("-c, --config <path>", "Path to bastion.yaml config file", "./bastion.yaml")
    .action(async (opts: { config: string }) => {
      try {
        const config = await loadConfig(opts.config);

        console.log("Configuration is valid!\n");

        // Proxy section
        console.log("[proxy]");
        console.log(`  host:      ${config.proxy.host}`);
        console.log(`  port:      ${config.proxy.port}`);
        console.log(`  log_level: ${config.proxy.log_level}`);

        // Providers section
        console.log("\n[providers]");
        console.log(`  primary:  ${config.providers.primary}`);
        console.log(`  fallback: ${config.providers.fallback ?? "(none)"}`);
        for (const [name, def] of Object.entries(config.providers.definitions)) {
          console.log(`  [providers.definitions.${name}]`);
          console.log(`    api_key:    ${maskKey(def.api_key)}`);
          if (def.base_url) console.log(`    base_url:   ${def.base_url}`);
          if (def.timeout_ms) console.log(`    timeout_ms: ${def.timeout_ms}`);
        }

        // Cache section
        if (config.cache) {
          console.log("\n[cache]");
          console.log(`  enabled:     ${config.cache.enabled}`);
          console.log(`  strategy:    ${config.cache.strategy}`);
          console.log(`  ttl_seconds: ${config.cache.ttl_seconds}`);
          console.log(`  max_entries: ${config.cache.max_entries}`);
        }

        // Rate limits section
        if (config.rate_limits) {
          console.log("\n[rate_limits]");
          console.log(`  enabled:             ${config.rate_limits.enabled}`);
          if (config.rate_limits.requests_per_minute) {
            console.log(`  requests_per_minute: ${config.rate_limits.requests_per_minute}`);
          }
          if (config.rate_limits.tokens_per_minute) {
            console.log(`  tokens_per_minute:   ${config.rate_limits.tokens_per_minute}`);
          }
        }

        // Policies section
        if (config.policies && config.policies.length > 0) {
          console.log("\n[policies]");
          for (const policy of config.policies) {
            console.log(`  - ${policy.name} (on: ${policy.on}, action: ${policy.action})`);
          }
        }

        // Audit section
        if (config.audit) {
          console.log("\n[audit]");
          console.log(`  enabled:  ${config.audit.enabled}`);
          console.log(`  output:   ${config.audit.output}`);
          if (config.audit.file_path) {
            console.log(`  file_path: ${config.audit.file_path}`);
          }
        }
      } catch (err) {
        console.error(
          "Validation failed:\n",
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}
