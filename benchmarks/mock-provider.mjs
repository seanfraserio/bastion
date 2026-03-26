/**
 * Mock LLM Provider Server (zero dependencies — uses Node built-in http)
 *
 * Mimics Anthropic and OpenAI APIs with configurable latency.
 * Use this instead of real providers to measure Bastion's overhead
 * without spending money or measuring upstream variability.
 *
 * Usage:
 *   node mock-provider.mjs                    # 50ms simulated latency
 *   MOCK_LATENCY_MS=0 node mock-provider.mjs  # zero latency (pure overhead test)
 *   MOCK_LATENCY_MS=200 node mock-provider.mjs # simulate slow provider
 */

import { createServer } from "node:http";

const LATENCY_MS = parseInt(process.env.MOCK_LATENCY_MS ?? "50", 10);
const PORT = parseInt(process.env.MOCK_PORT ?? "9999", 10);
const STREAM_CHUNKS = parseInt(process.env.MOCK_STREAM_CHUNKS ?? "5", 10);
const STREAM_CHUNK_DELAY_MS = parseInt(process.env.MOCK_STREAM_CHUNK_DELAY_MS ?? "20", 10);

let requestCount = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function json(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ── Streaming helpers ───────────────────────────────────────────────────────

async function streamAnthropic(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(`data: ${JSON.stringify({
    type: "message_start",
    message: {
      id: `msg_bench_${requestCount}`,
      type: "message",
      role: "assistant",
      model: body.model ?? "claude-haiku-4-5-20251001",
      content: [],
      usage: { input_tokens: 100, output_tokens: 0 },
    },
  })}\n\n`);

  res.write(`data: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}\n\n`);

  const words = ["Mock", "response", "for", "benchmark", "testing."];
  for (let i = 0; i < STREAM_CHUNKS; i++) {
    if (STREAM_CHUNK_DELAY_MS > 0) await sleep(STREAM_CHUNK_DELAY_MS);
    res.write(`data: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: (words[i % words.length]) + " " },
    })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
  res.write(`data: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: STREAM_CHUNKS * 2 },
  })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  res.end();
}

async function streamOpenAI(res, body) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const words = ["Mock", "response", "for", "benchmark", "testing."];
  for (let i = 0; i < STREAM_CHUNKS; i++) {
    if (STREAM_CHUNK_DELAY_MS > 0) await sleep(STREAM_CHUNK_DELAY_MS);
    res.write(`data: ${JSON.stringify({
      id: `chatcmpl-bench-${requestCount}`,
      object: "chat.completion.chunk",
      model: body.model ?? "gpt-4o-mini",
      choices: [{
        index: 0,
        delta: { content: (words[i % words.length]) + " " },
        finish_reason: null,
      }],
    })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({
    id: `chatcmpl-bench-${requestCount}`,
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

// ── Request handler ─────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  // GET /stats
  if (method === "GET" && url === "/stats") {
    return json(res, 200, { requests: requestCount, latency_ms: LATENCY_MS, stream_chunks: STREAM_CHUNKS });
  }

  // POST /v1/messages (Anthropic)
  if (method === "POST" && url === "/v1/messages") {
    requestCount++;
    const body = await readBody(req);
    if (LATENCY_MS > 0) await sleep(LATENCY_MS);

    if (body.stream) return streamAnthropic(res, body);

    return json(res, 200, {
      id: `msg_bench_${requestCount}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Mock response for benchmark testing." }],
      model: body.model ?? "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  }

  // POST /v1/chat/completions (OpenAI)
  if (method === "POST" && url === "/v1/chat/completions") {
    requestCount++;
    const body = await readBody(req);
    if (LATENCY_MS > 0) await sleep(LATENCY_MS);

    if (body.stream) return streamOpenAI(res, body);

    return json(res, 200, {
      id: `chatcmpl-bench-${requestCount}`,
      object: "chat.completion",
      model: body.model ?? "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Mock response for benchmark testing." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });
  }

  // 404
  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock provider running on http://127.0.0.1:${PORT}`);
  console.log(`  Simulated latency: ${LATENCY_MS}ms`);
  console.log(`  Stream chunks: ${STREAM_CHUNKS} (${STREAM_CHUNK_DELAY_MS}ms between)`);
  console.log(`  Anthropic: POST /v1/messages`);
  console.log(`  OpenAI:    POST /v1/chat/completions`);
});
