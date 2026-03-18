import type { IAuditExporter } from "./types.js";
import type { AuditEntry } from "../pipeline/types.js";

export class HttpExporter implements IAuditExporter {
  readonly name = "http";
  private buffer: AuditEntry[] = [];
  private endpoint: string;
  private headers: Record<string, string>;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(endpoint: string, headers?: Record<string, string>, flushIntervalMs: number = 5000) {
    this.endpoint = endpoint;
    this.headers = { "Content-Type": "application/json", ...headers };
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  export(entry: AuditEntry): void {
    this.buffer.push(entry);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ entries: batch }),
      });
    } catch (err) {
      // Log but don't throw — audit should never block
      console.error("HTTP audit export failed:", (err as Error).message);
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}
