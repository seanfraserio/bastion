import type { IAuditExporter } from "./types.js";
import type { AuditEntry } from "../pipeline/types.js";

/**
 * Abstract base class for exporters that buffer entries and flush periodically.
 * Handles timer setup (with unref) and graceful shutdown.
 */
export abstract class BufferedExporter implements IAuditExporter {
  abstract readonly name: string;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(flushIntervalMs: number = 5000) {
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  abstract export(entry: AuditEntry): void;
  abstract flush(): Promise<void>;

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}
