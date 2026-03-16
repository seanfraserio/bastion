import { FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db/client.js";
import { hashApiKey } from "../shared/api-keys.js";

export async function authenticateControlPlane(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"] as string | undefined;

  const key = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : apiKeyHeader;

  if (!key) {
    reply.code(401).send({ error: "unauthorized", message: "Missing API key" });
    return;
  }

  const keyHash = hashApiKey(key);
  const result = await query(
    "SELECT id, name, email, plan, status FROM tenants WHERE api_key_hash = $1 AND status = 'active'",
    [keyHash]
  );

  if (result.rows.length === 0) {
    reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
    return;
  }

  // Attach tenant to request
  (request as any).tenant = result.rows[0];
}
