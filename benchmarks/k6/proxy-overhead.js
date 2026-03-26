/**
 * Bastion Proxy Overhead — Buffered (non-streaming) requests
 *
 * Measures the latency Bastion adds on top of the upstream provider.
 * The mock provider runs with configurable latency (default 50ms),
 * so "proxy overhead = measured latency - mock latency".
 *
 * Usage:
 *   k6 run benchmarks/k6/proxy-overhead.js
 *   k6 run --out cloud benchmarks/k6/proxy-overhead.js   # send to Grafana Cloud
 *
 * Environment:
 *   BASTION_URL   — proxy URL (default http://127.0.0.1:4000)
 *   AUTH_TOKEN     — Bearer token (default bench-token-1)
 *   PROVIDER       — "anthropic" or "openai" (default anthropic)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

// Custom metrics
const proxyOverhead = new Trend("proxy_overhead_ms", true);
const cacheHits = new Counter("cache_hits");
const errorRate = new Rate("error_rate");

const BASTION_URL = __ENV.BASTION_URL || "http://127.0.0.1:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "bench-token-1";
const MOCK_LATENCY = parseInt(__ENV.MOCK_LATENCY_MS || "50", 10);
const PROVIDER = __ENV.PROVIDER || "anthropic";

// ── Test scenarios ──────────────────────────────────────────────────────────

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    // Ramp-up: find the throughput ceiling
    ramp_up: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 300,
      stages: [
        { duration: "30s", target: 50 },   // warm up
        { duration: "1m", target: 50 },    // sustained baseline
        { duration: "30s", target: 100 },  // ramp
        { duration: "1m", target: 100 },   // sustained medium
        { duration: "30s", target: 200 },  // ramp
        { duration: "1m", target: 200 },   // sustained high
        { duration: "30s", target: 0 },    // cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<250", "p(99)<500"],
    proxy_overhead_ms: ["p(95)<50"],
    error_rate: ["rate<0.05"],  // allow up to 5% errors at peak load
  },
};

// ── Request payloads ────────────────────────────────────────────────────────

const ANTHROPIC_PAYLOAD = JSON.stringify({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  messages: [{ role: "user", content: "What is 2+2? Answer in one word." }],
});

const OPENAI_PAYLOAD = JSON.stringify({
  model: "gpt-4o-mini",
  max_tokens: 256,
  messages: [
    { role: "system", content: "Answer concisely." },
    { role: "user", content: "What is 2+2? Answer in one word." },
  ],
});

// Use different messages to avoid 100% cache hits after warmup
const VARIED_MESSAGES = [
  "What is 2+2?",
  "What is 3+3?",
  "What is 4+4?",
  "What is 5+5?",
  "What is 6+6?",
  "What is 7+7?",
  "What is 8+8?",
  "What is 9+9?",
  "What is 10+10?",
  "What is 11+11?",
];

function makePayload(index) {
  const msg = VARIED_MESSAGES[index % VARIED_MESSAGES.length];
  if (PROVIDER === "openai") {
    return JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 256,
      messages: [{ role: "user", content: msg }],
    });
  }
  return JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: msg }],
  });
}

// ── Test function ───────────────────────────────────────────────────────────

let iteration = 0;

export default function () {
  const payload = makePayload(iteration++);
  const endpoint =
    PROVIDER === "openai" ? "/v1/chat/completions" : "/v1/messages";

  const res = http.post(`${BASTION_URL}${endpoint}`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "x-bastion-agent": "k6-bench",
      "x-bastion-env": "benchmark",
    },
    tags: { endpoint },
  });

  // Track results
  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "has response body": (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!success);

  // Calculate proxy overhead (total time minus mock provider latency)
  if (success) {
    const overhead = res.timings.duration - MOCK_LATENCY;
    proxyOverhead.add(Math.max(0, overhead));

    // Check if this was a cache hit (response time << mock latency)
    if (res.timings.duration < MOCK_LATENCY * 0.5) {
      cacheHits.add(1);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const p50 = data.metrics.http_req_duration?.values?.med ?? "?";
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"] ?? "?";
  const p99 = data.metrics.http_req_duration?.values?.["p(99)"] ?? "?";
  const overhead50 = data.metrics.proxy_overhead_ms?.values?.med ?? "?";
  const overhead95 =
    data.metrics.proxy_overhead_ms?.values?.["p(95)"] ?? "?";
  const overhead99 =
    data.metrics.proxy_overhead_ms?.values?.["p(99)"] ?? "?";
  const hits = data.metrics.cache_hits?.values?.count ?? 0;
  const total = data.metrics.http_reqs?.values?.count ?? 0;

  const summary = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BASTION PROXY OVERHEAD — BUFFERED REQUESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mock provider latency:  ${MOCK_LATENCY}ms
  Provider:               ${PROVIDER}
  Total requests:         ${total}
  Cache hits:             ${hits} (${total > 0 ? ((hits / total) * 100).toFixed(1) : 0}%)

  End-to-end latency:
    p50:  ${typeof p50 === "number" ? p50.toFixed(1) : p50}ms
    p95:  ${typeof p95 === "number" ? p95.toFixed(1) : p95}ms
    p99:  ${typeof p99 === "number" ? p99.toFixed(1) : p99}ms

  Proxy overhead (latency - ${MOCK_LATENCY}ms mock):
    p50:  ${typeof overhead50 === "number" ? overhead50.toFixed(1) : overhead50}ms
    p95:  ${typeof overhead95 === "number" ? overhead95.toFixed(1) : overhead95}ms
    p99:  ${typeof overhead99 === "number" ? overhead99.toFixed(1) : overhead99}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return {
    stdout: summary,
  };
}
