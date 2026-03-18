import type { IAuditExporter } from "./types.js";
import type { AuditEntry } from "../pipeline/types.js";

export class StdoutExporter implements IAuditExporter {
  readonly name = "stdout";
  export(entry: AuditEntry): void {
    console.log(JSON.stringify(entry));
  }
}
