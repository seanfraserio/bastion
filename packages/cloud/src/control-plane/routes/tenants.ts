import { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";
import { generateApiKey, hashApiKey } from "../../shared/api-keys.js";
import { CreateTenantRequest, CreateTenantResponse } from "../../shared/types.js";

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // Create tenant (no auth — this is the signup endpoint)
  app.post<{ Body: CreateTenantRequest }>("/tenants", async (request, reply) => {
    const { name, email, providerKeys, plan } = request.body;

    if (!name || !email) {
      return reply.code(400).send({ error: "name and email are required" });
    }

    // Check for existing email
    const existing = await query("SELECT id FROM tenants WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: "email already registered" });
    }

    const controlKey = generateApiKey("ctrl");
    const proxyKey = generateApiKey("proxy");

    const result = await query(
      `INSERT INTO tenants (name, email, api_key_hash, proxy_key_hash, provider_keys, plan)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, plan, status`,
      [name, email, hashApiKey(controlKey), hashApiKey(proxyKey), JSON.stringify(providerKeys || {}), plan || "team"]
    );

    const tenant = result.rows[0];

    // Create default config
    const defaultConfig = {
      providers: { primary: "anthropic" },
      cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 10000 },
      rate_limits: { enabled: true, requests_per_minute: 1000 },
      policies: [],
    };
    await query(
      "INSERT INTO tenant_configs (tenant_id, config) VALUES ($1, $2)",
      [tenant.id, JSON.stringify(defaultConfig)]
    );

    const response: CreateTenantResponse = {
      tenant: { id: tenant.id, name: tenant.name, email: tenant.email, plan: tenant.plan, status: tenant.status },
      controlKey,
      proxyKey,
    };

    return reply.code(201).send(response);
  });

  // Get current tenant (requires auth)
  app.get("/tenants/me", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });
    return tenant;
  });

  // Delete tenant (requires auth)
  app.delete("/tenants/me", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    await query("UPDATE tenants SET status = 'deleted', updated_at = NOW() WHERE id = $1", [tenant.id]);
    return reply.code(204).send();
  });

  // Rotate keys (requires auth)
  app.post("/tenants/me/rotate-keys", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const newControlKey = generateApiKey("ctrl");
    const newProxyKey = generateApiKey("proxy");

    await query(
      "UPDATE tenants SET api_key_hash = $1, proxy_key_hash = $2, updated_at = NOW() WHERE id = $3",
      [hashApiKey(newControlKey), hashApiKey(newProxyKey), tenant.id]
    );

    return { controlKey: newControlKey, proxyKey: newProxyKey };
  });
}
