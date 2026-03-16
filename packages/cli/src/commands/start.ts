import { Command } from "commander";
import { loadConfig } from "@openbastion-ai/config";
import { createServer } from "@openbastion-ai/proxy";

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the Bastion proxy server")
    .option("-c, --config <path>", "Path to bastion.yaml config file", "./bastion.yaml")
    .option("-p, --port <number>", "Port to listen on (overrides config)")
    .action(async (opts: { config: string; port?: string }) => {
      try {
        // Pre-validate config to surface errors before starting
        const validatedConfig = await loadConfig(opts.config);

        const port = opts.port
          ? parseInt(opts.port, 10)
          : validatedConfig.proxy.port;
        const host = validatedConfig.proxy.host;

        // createServer loads config internally from the path
        const { app } = await createServer(opts.config);

        const cacheStatus = validatedConfig.cache?.enabled !== false
          ? `enabled (${validatedConfig.cache?.strategy ?? "exact"})`
          : "disabled";
        const rateLimitStatus = validatedConfig.rate_limits?.enabled !== false
          ? "enabled"
          : "disabled";
        const auditOutput = validatedConfig.audit?.output ?? "file";
        const fallback = validatedConfig.providers.fallback ?? "none";

        await app.listen({ port, host });

        console.log(
          `Bastion v0.1.0 running on http://${host}:${port}\n` +
          `Primary provider: ${validatedConfig.providers.primary} | Fallback: ${fallback}\n` +
          `Cache: ${cacheStatus} | Rate limiting: ${rateLimitStatus} | Audit: ${auditOutput}`
        );
      } catch (err) {
        console.error(
          "Failed to start Bastion:",
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}
