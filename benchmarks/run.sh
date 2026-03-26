#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Bastion Benchmark Runner
#
# Orchestrates the mock provider + Bastion proxy + k6 load tests.
#
# Prerequisites:
#   brew install k6        (load testing)
#   pnpm build             (build Bastion from source)
#   npm i -g fastify       (or: the mock-provider uses the workspace fastify)
#
# Usage:
#   ./benchmarks/run.sh                     # run all benchmarks
#   ./benchmarks/run.sh overhead            # proxy overhead only
#   ./benchmarks/run.sh streaming           # streaming TTFB only
#   ./benchmarks/run.sh isolation           # middleware isolation only
#   ./benchmarks/run.sh quick               # 10s quick smoke test
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
MOCK_PORT=9999
BASTION_PORT=4000

# Use zero latency for isolation tests (measure pure proxy overhead)
MOCK_LATENCY_MS="${MOCK_LATENCY_MS:-50}"
ISOLATION_LATENCY_MS=0

mkdir -p "$RESULTS_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "Shutting down..."
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
  [[ -n "${BASTION_PID:-}" ]] && kill "$BASTION_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT

check_deps() {
  for cmd in k6 node; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: $cmd not found. Install it first."
      exit 1
    fi
  done

  if [[ ! -f "$PROJECT_ROOT/packages/cli/dist/index.js" ]]; then
    echo "Error: Bastion not built. Run 'pnpm build' first."
    exit 1
  fi
}

start_mock() {
  local latency="${1:-$MOCK_LATENCY_MS}"
  echo "Starting mock provider (latency: ${latency}ms, port: $MOCK_PORT)..."
  MOCK_LATENCY_MS="$latency" MOCK_PORT="$MOCK_PORT" \
    node "$SCRIPT_DIR/mock-provider.mjs" &
  MOCK_PID=$!
  sleep 1

  if ! kill -0 "$MOCK_PID" 2>/dev/null; then
    echo "Error: Mock provider failed to start"
    exit 1
  fi
}

stop_mock() {
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
  wait "$MOCK_PID" 2>/dev/null || true
  unset MOCK_PID
}

start_bastion() {
  local config="$1"
  echo "Starting Bastion with config: $(basename "$config")..."
  node "$PROJECT_ROOT/packages/cli/dist/index.js" start -c "$config" \
    > "$RESULTS_DIR/bastion.log" 2>&1 &
  BASTION_PID=$!
  sleep 2

  if ! kill -0 "$BASTION_PID" 2>/dev/null; then
    echo "Error: Bastion failed to start with config $(basename "$config")"
    exit 1
  fi

  # Wait for health check
  for i in $(seq 1 10); do
    if curl -sf "http://127.0.0.1:$BASTION_PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "Error: Bastion health check failed"
  exit 1
}

stop_bastion() {
  [[ -n "${BASTION_PID:-}" ]] && kill "$BASTION_PID" 2>/dev/null || true
  wait "$BASTION_PID" 2>/dev/null || true
  unset BASTION_PID
  sleep 1
}

# ── Benchmark: Proxy Overhead ────────────────────────────────────────────────

run_overhead() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  BENCHMARK: Proxy Overhead (buffered requests)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  start_mock "$MOCK_LATENCY_MS"
  start_bastion "$SCRIPT_DIR/configs/full-pipeline.yaml"

  MOCK_LATENCY_MS="$MOCK_LATENCY_MS" \
    k6 run "$SCRIPT_DIR/k6/proxy-overhead.js" 2>&1

  stop_bastion
  stop_mock
}

# ── Benchmark: Streaming TTFB ────────────────────────────────────────────────

run_streaming() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  BENCHMARK: Streaming Time-to-First-Byte"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  start_mock "$MOCK_LATENCY_MS"
  start_bastion "$SCRIPT_DIR/configs/full-pipeline.yaml"

  k6 run "$SCRIPT_DIR/k6/streaming-overhead.js" 2>&1

  stop_bastion
  stop_mock
}

# ── Benchmark: Middleware Isolation ───────────────────────────────────────────

run_isolation() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  BENCHMARK: Middleware Isolation (zero mock latency)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Config                │    p50    │    p95    │    p99    │ reqs"
  echo "  ──────────────────────┼───────────┼───────────┼───────────┼──────"

  start_mock "$ISOLATION_LATENCY_MS"

  for config in auth-only no-cache no-audit full-pipeline; do
    start_bastion "$SCRIPT_DIR/configs/${config}.yaml"

    CONFIG_NAME="$config" MOCK_LATENCY_MS="$ISOLATION_LATENCY_MS" \
      k6 run --quiet "$SCRIPT_DIR/k6/middleware-isolation.js" 2>&1 || true

    stop_bastion
  done

  stop_mock

  echo ""
  echo "  Results saved to: $RESULTS_DIR/"
}

# ── Quick Smoke Test ─────────────────────────────────────────────────────────

run_quick() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  QUICK SMOKE TEST (10s, 10 req/s)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  start_mock 0
  start_bastion "$SCRIPT_DIR/configs/full-pipeline.yaml"

  MOCK_LATENCY_MS=0 k6 run --no-thresholds --duration 10s --vus 5 \
    "$SCRIPT_DIR/k6/proxy-overhead.js" 2>&1

  stop_bastion
  stop_mock
}

# ── Main ─────────────────────────────────────────────────────────────────────

check_deps

case "${1:-all}" in
  overhead)   run_overhead ;;
  streaming)  run_streaming ;;
  isolation)  run_isolation ;;
  quick)      run_quick ;;
  all)
    run_overhead
    run_streaming
    run_isolation
    ;;
  *)
    echo "Usage: $0 {all|overhead|streaming|isolation|quick}"
    exit 1
    ;;
esac

echo ""
echo "Done. Results in $RESULTS_DIR/"
