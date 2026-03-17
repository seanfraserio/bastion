#!/bin/bash
# Trilogy Demo: Forge → Bastion → Lantern
# This script demonstrates all three products working together.

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Forge / Bastion / Lantern Trilogy Demo"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY is not set"
  echo "   export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

BASTION_URL="${BASTION_URL:-http://localhost:4000}"

echo "📋 Step 1: Validate Forge agent config"
echo "   forge validate -c forge.yaml"
echo ""

echo "📋 Step 2: Deploy agent (config points at Bastion)"
echo "   forge deploy -c forge.yaml --auto-approve"
echo ""

echo "🛡️  Step 3: Send request through Bastion proxy"
echo ""
RESPONSE=$(curl -s -X POST ${BASTION_URL}/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${ANTHROPIC_API_KEY}" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "What is Bastion in one sentence?"}]
  }')

echo "Response from Claude (via Bastion):"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

echo "📊 Step 4: Check Bastion stats"
HEALTH=$(curl -s ${BASTION_URL}/health)
echo "Health: $HEALTH"
echo ""

STATS=$(curl -s ${BASTION_URL}/stats)
echo "Stats: $STATS"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Demo complete!"
echo ""
echo "  Forge defined the agent → Bastion proxied the request"
echo "  → Lantern received the trace (if configured)"
echo ""
echo "  Dashboard: https://dashboard.openbastionai.org"
echo "  Docs:      https://openbastionai.org"
echo "═══════════════════════════════════════════════════════════"
