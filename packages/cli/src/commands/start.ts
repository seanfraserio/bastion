import { Command } from "commander";
import { createServer } from "@openbastion-ai/proxy";

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the Bastion proxy server")
    .option("-c, --config <path>", "Path to bastion.yaml config file", "./bastion.yaml")
    .option("-p, --port <number>", "Port to listen on (overrides config)")
    .action(async (opts: { config: string; port?: string }) => {
      try {
        const { app, config } = await createServer(opts.config);

        const port = opts.port
          ? parseInt(opts.port, 10)
          : config.proxy.port;
        const host = config.proxy.host;

        const cacheStatus = config.cache?.enabled !== false
          ? `enabled (${config.cache?.strategy ?? "exact"})`
          : "disabled";
        const rateLimitStatus = config.rate_limits?.enabled !== false
          ? "enabled"
          : "disabled";
        const auditOutput = config.audit?.output ?? "file";

        await app.listen({ port, host });

        if (config.upstream) {
          console.log(
            `Bastion v0.2.4 running on http://${host}:${port}\n` +
            `Mode: edge → ${config.upstream.url}\n` +
            `Cache: ${cacheStatus} | Rate limiting: ${rateLimitStatus} | Audit: ${auditOutput}`
          );
        } else {
          const fallback = config.providers?.fallback ?? "none";
          console.log(
            `Bastion v0.2.4 running on http://${host}:${port}\n` +
            `Primary provider: ${config.providers?.primary} | Fallback: ${fallback}\n` +
            `Cache: ${cacheStatus} | Rate limiting: ${rateLimitStatus} | Audit: ${auditOutput}`
          );
        }
      } catch (err) {
        console.error(
          "Failed to start Bastion:",
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    });
}
