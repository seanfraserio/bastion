import { Command } from "commander";
import { loadConfig } from "@bastion-ai/config";

interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

interface StatsResponse {
  totalRequests: number;
  blockedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  providerBreakdown: Record<string, { requests: number; tokens: number }>;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check the status of a running Bastion instance")
    .option("-c, --config <path>", "Path to bastion.yaml config file", "./bastion.yaml")
    .action(async (opts: { config: string }) => {
      try {
        const config = await loadConfig(opts.config);
        const port = config.proxy.port;
        const host = config.proxy.host;
        const baseUrl = `http://${host}:${port}`;

        // Fetch health
        const healthRes = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const health = (await healthRes.json()) as HealthResponse;

        console.log("=== Bastion Status ===");
        console.log(`  Status:  ${health.status}`);
        console.log(`  Version: ${health.version}`);
        console.log(`  Uptime:  ${formatUptime(health.uptime)}`);

        // Fetch stats
        try {
          const statsRes = await fetch(`${baseUrl}/stats`, {
            signal: AbortSignal.timeout(5000),
          });
          const stats = (await statsRes.json()) as StatsResponse;

          console.log("\n=== Request Stats ===");
          console.log(`  Total requests:    ${stats.totalRequests}`);
          console.log(`  Blocked requests:  ${stats.blockedRequests}`);
          console.log(`  Cache hits:        ${stats.cacheHits}`);
          console.log(`  Cache misses:      ${stats.cacheMisses}`);
          console.log(`  Cache hit rate:    ${(stats.cacheHitRate * 100).toFixed(1)}%`);

          console.log("\n=== Token Usage ===");
          console.log(`  Input tokens:      ${stats.totalInputTokens}`);
          console.log(`  Output tokens:     ${stats.totalOutputTokens}`);
          console.log(`  Estimated cost:    $${stats.totalEstimatedCostUsd.toFixed(4)}`);

          if (Object.keys(stats.providerBreakdown).length > 0) {
            console.log("\n=== Provider Breakdown ===");
            for (const [provider, data] of Object.entries(stats.providerBreakdown)) {
              console.log(`  ${provider}: ${data.requests} requests, ${data.tokens} tokens`);
            }
          }
        } catch {
          // Stats endpoint may not be available
          console.log("\n(Stats endpoint not available)");
        }
      } catch (err) {
        if (
          err instanceof TypeError &&
          (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED"))
        ) {
          console.error(
            "Bastion is not running. Start it with: bastion start",
          );
        } else {
          console.error(
            "Status check failed:",
            err instanceof Error ? err.message : String(err),
          );
        }
        process.exit(1);
      }
    });
}
