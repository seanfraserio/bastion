import { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // Get usage summary
  app.get("/tenants/me/usage", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { start, end } = request.query as { start?: string; end?: string };
    const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end || new Date().toISOString();

    const result = await query(
      `SELECT
        COUNT(*)::integer AS total_requests,
        COALESCE(SUM(input_tokens), 0)::integer AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::integer AS total_output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_estimated_cost_usd,
        COUNT(*) FILTER (WHERE status = 'blocked')::integer AS blocked_requests,
        COUNT(*) FILTER (WHERE cache_hit = true)::integer AS cache_hits,
        COALESCE(AVG(duration_ms), 0)::integer AS average_duration_ms
      FROM usage_logs
      WHERE tenant_id = $1 AND timestamp >= $2 AND timestamp <= $3`,
      [tenant.id, startDate, endDate]
    );

    const row = result.rows[0];
    return {
      totalRequests: row.total_requests,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalEstimatedCostUsd: parseFloat(row.total_estimated_cost_usd),
      blockedRequests: row.blocked_requests,
      cacheHits: row.cache_hits,
      averageDurationMs: row.average_duration_ms,
      period: { start: startDate, end: endDate },
    };
  });

  // Get usage breakdown by model
  app.get("/tenants/me/usage/breakdown", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { start, end } = request.query as { start?: string; end?: string };
    const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end || new Date().toISOString();

    const result = await query(
      `SELECT
        provider, model,
        COUNT(*)::integer AS requests,
        COALESCE(SUM(input_tokens), 0)::integer AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::integer AS output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS estimated_cost_usd
      FROM usage_logs
      WHERE tenant_id = $1 AND timestamp >= $2 AND timestamp <= $3
      GROUP BY provider, model
      ORDER BY requests DESC`,
      [tenant.id, startDate, endDate]
    );

    return { breakdown: result.rows, period: { start: startDate, end: endDate } };
  });
}
