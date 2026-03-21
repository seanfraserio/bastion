import http from "node:http";

export interface MockProviderBackend {
  url: string;
  port: number;
  close: () => Promise<void>;
  requests: { path: string; body: unknown }[];
}

export async function createMockProviderBackend(): Promise<MockProviderBackend> {
  const requests: { path: string; body: unknown }[] = [];

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push({ path: req.url ?? "", body: parsed });

      if (req.url === "/v1/messages") {
        if (parsed.stream) {
          // Anthropic streaming SSE format
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model: parsed.model ?? "claude-sonnet-4-6", usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`);
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Mock " } })}\n\n`);
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "streaming response" } })}\n\n`);
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
          res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
          res.end();
        } else {
          // Anthropic non-streaming format
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            id: "msg_mock",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Mock Anthropic response" }],
            model: parsed.model ?? "claude-sonnet-4-6",
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 20 },
          }));
        }
      } else if (req.url === "/v1/chat/completions") {
        if (parsed.stream) {
          // OpenAI streaming SSE format
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
          res.write(`data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "" } }], usage: null })}\n\n`);
          res.write(`data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Mock " } }], usage: null })}\n\n`);
          res.write(`data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "streaming response" } }], usage: null })}\n\n`);
          res.write(`data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          // OpenAI non-streaming format
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: "Mock OpenAI response" }, finish_reason: "stop" }],
            model: parsed.model ?? "gpt-4o",
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }));
        }
      } else if (req.url?.startsWith("/api/chat")) {
        // Ollama format
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          model: parsed.model ?? "llama3",
          message: { role: "assistant", content: "Mock Ollama response" },
          done: true,
          eval_count: 20,
          prompt_eval_count: 10,
        }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
        requests,
      });
    });
  });
}
