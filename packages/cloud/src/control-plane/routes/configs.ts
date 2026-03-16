import { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { UpdateConfigRequest } from "../../shared/types.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  // Get tenant config
  app.get("/tenants/me/config", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const result = await query(
      "SELECT config, version, updated_at FROM tenant_configs WHERE tenant_id = $1",
      [tenant.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "config not found" });
    }

    return result.rows[0];
  });

  // Update tenant config
  app.put<{ Body: UpdateConfigRequest }>("/tenants/me/config", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { config } = request.body;
    if (!config) {
      return reply.code(400).send({ error: "config is required" });
    }

    // Validate config has required fields
    if (!config.providers?.primary) {
      return reply.code(400).send({ error: "config.providers.primary is required" });
    }

    const result = await query(
      `INSERT INTO tenant_configs (tenant_id, config, version, updated_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET config = $2, version = tenant_configs.version + 1, updated_at = NOW()
       RETURNING version, updated_at`,
      [tenant.id, JSON.stringify(config)]
    );

    return { config, version: result.rows[0].version, updatedAt: result.rows[0].updated_at };
  });
}
