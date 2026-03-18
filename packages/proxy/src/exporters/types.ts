import type { AuditEntry } from "../pipeline/types.js";

export interface IAuditExporter {
  readonly name: string;
  export(entry: AuditEntry): void; // fire-and-forget, no await
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
}
