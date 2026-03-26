/**
 * Bastion Streaming Overhead — SSE (streaming) requests
 *
 * Measures TTFB (time-to-first-byte) through Bastion's streaming proxy.
 * This is what end-users perceive as "how fast does the AI start responding?"
 *
 * Usage:
 *   k6 run benchmarks/k6/streaming-overhead.js
 *
 * Note: k6 doesn't natively parse SSE streams, but it does track TTFB
 * via http_req_waiting (time from request sent to first byte received).
 */

import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const streamTTFB = new Trend("stream_ttfb_ms", true);
const errorRate = new Rate("error_rate");

const BASTION_URL = __ENV.BASTION_URL || "http://127.0.0.1:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "bench-token-1";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    streaming: {
      executor: "constant-arrival-rate",
      rate: 30,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    stream_ttfb_ms: ["p(50)<100", "p(95)<300"],
    error_rate: ["rate<0.01"],
  },
};

const MESSAGES = [
  "Explain quantum computing briefly.",
  "What causes rain?",
  "How do computers work?",
  "What is gravity?",
  "Explain photosynthesis.",
];

let iteration = 0;

export default function () {
  const msg = MESSAGES[iteration++ % MESSAGES.length];

  const res = http.post(
    `${BASTION_URL}/v1/messages`,
    JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      stream: true,
      messages: [{ role: "user", content: msg }],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "x-bastion-agent": "k6-stream-bench",
      },
    },
  );

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
  });

  errorRate.add(!success);

  if (success) {
    // http_req_waiting = TTFB (time server took before sending first byte)
    streamTTFB.add(res.timings.waiting);
  }
}

export function handleSummary(data) {
  const ttfb50 = data.metrics.stream_ttfb_ms?.values?.med ?? "?";
  const ttfb95 = data.metrics.stream_ttfb_ms?.values?.["p(95)"] ?? "?";
  const total = data.metrics.http_reqs?.values?.count ?? 0;

  const summary = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BASTION STREAMING — TIME TO FIRST BYTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total requests:  ${total}

  TTFB (time to first byte):
    p50:  ${typeof ttfb50 === "number" ? ttfb50.toFixed(1) : ttfb50}ms
    p95:  ${typeof ttfb95 === "number" ? ttfb95.toFixed(1) : ttfb95}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return { stdout: summary };
}
