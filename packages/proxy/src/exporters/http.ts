import pino from "pino";
import type { IAuditExporter } from "./types.js";
import type { AuditEntry } from "../pipeline/types.js";

const logger = pino({ name: "bastion:exporter:http" });

const MAX_RETRIES = 3;

interface RetryBatch {
  entries: AuditEntry[];
  retryCount: number;
}

export class HttpExporter implements IAuditExporter {
  readonly name = "http";
  private buffer: AuditEntry[] = [];
  private retryQueue: RetryBatch[] = [];
  private endpoint: string;
  private headers: Record<string, string>;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(endpoint: string, headers?: Record<string, string>, flushIntervalMs: number = 5000) {
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      throw new Error(`HttpExporter endpoint must start with http:// or https://, got: ${endpoint}`);
    }
    this.endpoint = endpoint;
    this.headers = { "Content-Type": "application/json", ...headers };
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  export(entry: AuditEntry): void {
    this.buffer.push(entry);
  }

  async flush(): Promise<void> {
    // Process retry queue first
    const retries = this.retryQueue.splice(0);
    for (const batch of retries) {
      await this.sendBatch(batch.entries, batch.retryCount);
    }

    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    await this.sendBatch(batch, 0);
  }

  private async sendBatch(entries: AuditEntry[], retryCount: number): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ entries }),
      });
    } catch (err) {
      // Log but don't throw — audit should never block
      logger.error({ err }, "HTTP audit export failed");
      if (retryCount < MAX_RETRIES) {
        this.retryQueue.push({ entries, retryCount: retryCount + 1 });
      } else {
        logger.error(`HTTP audit export dropped batch after ${MAX_RETRIES} retries (${entries.length} entries)`);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}
