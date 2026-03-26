/**
 * Bastion Middleware Isolation Test
 *
 * Runs a fixed workload against 4 config variants to measure per-middleware cost:
 *   1. auth-only.yaml      — baseline (auth + provider, no middleware)
 *   2. no-cache.yaml       — everything except cache
 *   3. no-audit.yaml       — everything except audit
 *   4. full-pipeline.yaml  — all middleware enabled
 *
 * DON'T run this directly — use run.sh which restarts Bastion between configs.
 * This script is called once per config variant.
 *
 * Usage:
 *   CONFIG_NAME=auth-only k6 run benchmarks/k6/middleware-isolation.js
 */

import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const latency = new Trend("request_latency_ms", true);
const errorRate = new Rate("error_rate");

const BASTION_URL = __ENV.BASTION_URL || "http://127.0.0.1:4000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "bench-token-1";
const CONFIG_NAME = __ENV.CONFIG_NAME || "unknown";
const MOCK_LATENCY = parseInt(__ENV.MOCK_LATENCY_MS || "0", 10);

// Fixed workload: constant rate for fair comparison between configs
export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    fixed_rate: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    error_rate: ["rate<0.10"],  // allow up to 10% at high fixed rate
  },
};

// Use unique messages to avoid cache influencing results
let iteration = 0;

export default function () {
  const i = iteration++;
  const res = http.post(
    `${BASTION_URL}/v1/messages`,
    JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: `Middleware isolation test message ${i}` }],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "x-bastion-agent": "k6-isolation",
      },
    },
  );

  const success = check(res, { "status 200": (r) => r.status === 200 });
  errorRate.add(!success);

  if (success) {
    latency.add(res.timings.duration);
  }
}

export function handleSummary(data) {
  const p50 = data.metrics.request_latency_ms?.values?.med ?? "?";
  const p95 = data.metrics.request_latency_ms?.values?.["p(95)"] ?? "?";
  const p99 = data.metrics.request_latency_ms?.values?.["p(99)"] ?? "?";
  const reqs = data.metrics.http_reqs?.values?.count ?? 0;

  const fmt = (v) => (typeof v === "number" ? v.toFixed(1) : v);

  const summary = `  ${CONFIG_NAME.padEnd(20)} │ p50: ${fmt(p50).padStart(7)}ms │ p95: ${fmt(p95).padStart(7)}ms │ p99: ${fmt(p99).padStart(7)}ms │ reqs: ${reqs}\n`;

  // Also write to a results file for the run.sh script to aggregate
  return {
    stdout: summary,
    [`benchmarks/results/${CONFIG_NAME}.json`]: JSON.stringify({
      config: CONFIG_NAME,
      mock_latency_ms: MOCK_LATENCY,
      total_requests: reqs,
      p50_ms: p50,
      p95_ms: p95,
      p99_ms: p99,
    }),
  };
}
