import { Command } from "commander";
import { loadConfig } from "@bastion-ai/config";

export function registerTestCommand(program: Command): void {
  program
    .command("test")
    .description("Send a test request through the Bastion proxy")
    .option("-c, --config <path>", "Path to bastion.yaml config file", "./bastion.yaml")
    .action(async (opts: { config: string }) => {
      try {
        const config = await loadConfig(opts.config);
        const port = config.proxy.port;
        const host = config.proxy.host;
        const url = `http://${host}:${port}/v1/messages`;

        console.log(`Sending test request to ${url}...`);

        const startTime = performance.now();

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 10,
            messages: [{ role: "user", content: "Say: BASTION_OK" }],
          }),
          signal: AbortSignal.timeout(30000),
        });

        const elapsed = (performance.now() - startTime).toFixed(0);
        const body = await res.text();

        if (res.ok) {
          console.log(`\nResponse (${elapsed}ms):`);
          try {
            const parsed = JSON.parse(body);
            console.log(JSON.stringify(parsed, null, 2));
          } catch {
            console.log(body);
          }
        } else {
          console.error(`\nRequest failed with status ${res.status} (${elapsed}ms):`);
          console.error(body);
          process.exit(1);
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
            "Test failed:",
            err instanceof Error ? err.message : String(err),
          );
        }
        process.exit(1);
      }
    });
}
