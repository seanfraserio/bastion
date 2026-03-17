import { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tenants/me/audit", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { page = "1", limit = "50", status, provider, model, start, end } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "WHERE tenant_id = $1";
    const params: unknown[] = [tenant.id];
    let paramIndex = 2;

    if (status) { whereClause += ` AND status = $${paramIndex++}`; params.push(status); }
    if (provider) { whereClause += ` AND provider = $${paramIndex++}`; params.push(provider); }
    if (model) { whereClause += ` AND model = $${paramIndex++}`; params.push(model); }
    if (start) { whereClause += ` AND timestamp >= $${paramIndex++}`; params.push(start); }
    if (end) { whereClause += ` AND timestamp <= $${paramIndex++}`; params.push(end); }

    const countResult = await query(`SELECT COUNT(*)::integer AS total FROM usage_logs ${whereClause}`, params);
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT id, timestamp, provider, model, input_tokens, output_tokens, estimated_cost_usd, status, duration_ms, cache_hit
       FROM usage_logs ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limitNum, offset]
    );

    return { entries: result.rows, total, page: pageNum, limit: limitNum };
  });
}
