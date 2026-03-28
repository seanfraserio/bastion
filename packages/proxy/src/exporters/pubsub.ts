import pino from "pino";
import type { IAuditExporter } from "./types.js";
import type { AuditEntry } from "../pipeline/types.js";
import { PubSub, type Topic } from "@google-cloud/pubsub";

const logger = pino({ name: "bastion:exporter:pubsub" });

export interface PubSubExporterOptions {
  topicName: string;
  projectId?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  orderingKey?: string;
}

export class PubSubExporter implements IAuditExporter {
  readonly name = "pubsub";

  private buffer: AuditEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private pubsub: InstanceType<typeof PubSub>;
  private topic: Topic;
  private batchSize: number;
  private orderingKey?: string;

  constructor(options: PubSubExporterOptions) {
    this.batchSize = options.batchSize ?? 100;
    this.orderingKey = options.orderingKey;

    this.pubsub = new PubSub(
      options.projectId ? { projectId: options.projectId } : undefined,
    );
    this.topic = this.pubsub.topic(options.topicName);

    const flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  export(entry: AuditEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.batchSize) {
      this.flush().catch(() => {
        // fire-and-forget: errors handled inside flush
      });
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    try {
      const data = Buffer.from(JSON.stringify(batch));

      const message: { data: Buffer; orderingKey?: string } = { data };

      if (this.orderingKey) {
        if (this.orderingKey === "agent") {
          // Resolve from the first entry's agent name
          const agentName = batch[0]?.agentName;
          if (agentName) {
            message.orderingKey = agentName;
          }
        } else {
          message.orderingKey = this.orderingKey;
        }
      }

      await this.topic.publishMessage(message);
    } catch (err) {
      logger.error({ err }, "Pub/Sub audit export failed");
      console.error("Pub/Sub audit export failed", err);
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
    await this.topic.flush();
    await this.pubsub.close();
  }
}
