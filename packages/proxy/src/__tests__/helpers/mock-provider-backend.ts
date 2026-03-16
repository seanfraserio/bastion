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
        // Anthropic format
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
      } else if (req.url === "/v1/chat/completions") {
        // OpenAI format
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-mock",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "Mock OpenAI response" }, finish_reason: "stop" }],
          model: parsed.model ?? "gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }));
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
