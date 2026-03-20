import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface GrafanaConfig {
  endpoint: string;
  user: string;
  token: string;
}

interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  attributes: Record<string, string | number | boolean>;
  timestamp: number;
}

function msToNs(ms: number): string {
  return `${ms}000000`;
}

function toAttr(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

/**
 * Normalizes route paths to reduce metric cardinality.
 * /v1/messages -> /v1/messages
 * /v1/chat/completions -> /v1/chat/completions
 */
function normalizeRoute(path: string): string {
  return path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/[0-9a-f]{8,}|\/\d+/g,
    "/:id",
  );
}

class MetricsBuffer {
  private metrics: MetricPoint[] = [];
  private logs: LogEntry[] = [];
  private config: GrafanaConfig;
  private serviceName: string;
  private authHeader: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: GrafanaConfig, serviceName: string) {
    this.config = config;
    this.serviceName = serviceName;
    this.authHeader = `Basic ${Buffer.from(`${config.user}:${config.token}`).toString("base64")}`;
    this.flushTimer = setInterval(() => this.flush().catch(console.error), 15_000);
    this.flushTimer.unref();
  }

  addMetric(point: MetricPoint): void {
    this.metrics.push(point);
    if (this.metrics.length >= 200) {
      this.flush().catch(console.error);
    }
  }

  addLog(entry: LogEntry): void {
    this.logs.push(entry);
  }

  async flush(): Promise<void> {
    const metricsToFlush = this.metrics.splice(0);
    const logsToFlush = this.logs.splice(0);
    const promises: Promise<void>[] = [];
    if (metricsToFlush.length > 0) promises.push(this.flushMetrics(metricsToFlush));
    if (logsToFlush.length > 0) promises.push(this.flushLogs(logsToFlush));
    if (promises.length > 0) await Promise.allSettled(promises);
  }

  private async flushMetrics(metrics: MetricPoint[]): Promise<void> {
    try {
      const metricMap = new Map<string, Array<{ asDouble: number; timeUnixNano: string; attributes: Array<{ key: string; value: { stringValue: string } }> }>>();
      for (const point of metrics) {
        if (!metricMap.has(point.name)) metricMap.set(point.name, []);
        metricMap.get(point.name)!.push({
          asDouble: point.value,
          timeUnixNano: msToNs(point.timestamp),
          attributes: Object.entries(point.labels).map(([k, v]) => toAttr(k, v)),
        });
      }
      const body = JSON.stringify({
        resourceMetrics: [{
          resource: { attributes: [toAttr("service.name", this.serviceName)] },
          scopeMetrics: [{
            metrics: Array.from(metricMap.entries()).map(([name, dataPoints]) => ({
              name,
              gauge: { dataPoints },
            })),
          }],
        }],
      });
      await fetch(`${this.config.endpoint}/otlp/v1/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: this.authHeader },
        body,
      });
    } catch {
      // Silent — observability should never break the app
    }
  }

  private async flushLogs(logs: LogEntry[]): Promise<void> {
    try {
      const body = JSON.stringify({
        resourceLogs: [{
          resource: { attributes: [toAttr("service.name", this.serviceName)] },
          scopeLogs: [{
            logRecords: logs.map((log) => ({
              timeUnixNano: msToNs(log.timestamp),
              severityText: log.level.toUpperCase(),
              body: { stringValue: log.message },
              attributes: Object.entries(log.attributes).map(([k, v]) => toAttr(k, String(v))),
            })),
          }],
        }],
      });
      await fetch(`${this.config.endpoint}/otlp/v1/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: this.authHeader },
        body,
      });
    } catch {
      // Silent
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    await this.flush();
  }
}

let buffer: MetricsBuffer | null = null;

/**
 * Register observability hooks on the Fastify server.
 * Sends metrics + logs to Grafana Cloud via OTLP.
 */
export function registerObservability(app: FastifyInstance, serviceName: string): void {
  const grafanaEndpoint = process.env.GRAFANA_PUSH_URL;
  const grafanaUser = process.env.GRAFANA_USER;
  const grafanaToken = process.env.GRAFANA_TOKEN;

  if (!grafanaEndpoint || !grafanaUser || !grafanaToken) {
    app.log.info("[obs] Observability disabled (GRAFANA_PUSH_URL/USER/TOKEN not set)");
    return;
  }

  buffer = new MetricsBuffer(
    { endpoint: grafanaEndpoint, user: grafanaUser, token: grafanaToken },
    serviceName,
  );

  // Track request start time
  app.addHook("onRequest", async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).__obsStart = Date.now();
  });

  // Record metrics after response
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = (request as unknown as Record<string, unknown>).__obsStart as number | undefined;
    if (!start || !buffer) return;

    const durationMs = Date.now() - start;
    const route = normalizeRoute(request.url.split("?")[0]);
    const method = request.method;
    const statusCode = String(reply.statusCode);
    const now = Date.now();

    const baseLabels = { method, route, status_code: statusCode };

    // Request duration
    buffer.addMetric({ name: "http_request_duration_ms", value: durationMs, labels: baseLabels, timestamp: now });

    // Request counter
    buffer.addMetric({ name: "http_request_total", value: 1, labels: baseLabels, timestamp: now });

    // Error counter for 4xx/5xx
    if (reply.statusCode >= 400) {
      const errorClass = reply.statusCode >= 500 ? "5xx" : "4xx";
      buffer.addMetric({ name: "http_error_total", value: 1, labels: { ...baseLabels, error_class: errorClass }, timestamp: now });

      if (reply.statusCode === 429) {
        buffer.addMetric({ name: "rate_limit_total", value: 1, labels: { method, route }, timestamp: now });
      }
    }

    // Structured log
    let level: "info" | "warn" | "error" = "info";
    if (reply.statusCode >= 500) level = "error";
    else if (reply.statusCode >= 400) level = "warn";
    buffer.addLog({
      level,
      message: `${method} ${route} ${statusCode} ${durationMs}ms`,
      attributes: { method, route, status_code: statusCode, duration_ms: durationMs },
      timestamp: now,
    });

    // Flush after each request — Cloud Run idle CPU prevents timer-based flushing
    buffer.flush().catch(() => {});
  });

  // Graceful shutdown
  app.addHook("onClose", async () => {
    if (buffer) await buffer.shutdown();
  });

  app.log.info(`[obs] Observability enabled for ${serviceName} → ${grafanaEndpoint}`);
}

/**
 * Record a custom business metric.
 */
export function recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
  buffer?.addMetric({ name, value, labels, timestamp: Date.now() });
}
