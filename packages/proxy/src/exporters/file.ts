import type { AuditEntry } from "../pipeline/types.js";
import { BufferedExporter } from "./buffered.js";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

const logger = pino({ name: "bastion:exporter:file" });

export class FileExporter extends BufferedExporter {
  readonly name = "file";
  private buffer: string[] = [];
  private filePath: string;

  constructor(filePath: string, flushIntervalMs: number = 5000) {
    super(flushIntervalMs);
    this.filePath = path.resolve(filePath);
    if (filePath.includes("..")) {
      throw new Error(`Audit log path must not contain '..': ${this.filePath}`);
    }
    // Create directory
    const dir = path.dirname(this.filePath);
    fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
  }

  export(entry: AuditEntry): void {
    this.buffer.push(JSON.stringify(entry));
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    try {
      await fs.promises.appendFile(this.filePath, batch.join("\n") + "\n", "utf-8");
    } catch (err) {
      logger.error({ err }, "Failed to write audit log batch");
    }
  }
}
