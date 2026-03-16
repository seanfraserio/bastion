import { query } from "../db/client.js";
import { hashApiKey } from "../shared/api-keys.js";
import { Tenant, TenantBastionConfig } from "../shared/types.js";

interface ResolvedTenant {
  tenant: Tenant;
  config: TenantBastionConfig;
}

// In-memory cache for tenant lookups (avoids DB hit on every request)
const tenantCache = new Map<string, { data: ResolvedTenant; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function resolveTenant(proxyKey: string): Promise<ResolvedTenant | null> {
  const keyHash = hashApiKey(proxyKey);

  // Check cache
  const cached = tenantCache.get(keyHash);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Query DB
  const result = await query(
    `SELECT t.id, t.name, t.email, t.api_key_hash, t.proxy_key_hash,
            t.provider_keys, t.plan, t.status, t.created_at, t.updated_at,
            tc.config
     FROM tenants t
     JOIN tenant_configs tc ON tc.tenant_id = t.id
     WHERE t.proxy_key_hash = $1 AND t.status = 'active'`,
    [keyHash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const tenant: Tenant = {
    id: row.id,
    name: row.name,
    email: row.email,
    apiKeyHash: row.api_key_hash,
    proxyKeyHash: row.proxy_key_hash,
    providerKeys: typeof row.provider_keys === "string" ? JSON.parse(row.provider_keys) : row.provider_keys,
    plan: row.plan,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const config: TenantBastionConfig = typeof row.config === "string" ? JSON.parse(row.config) : row.config;

  const resolved = { tenant, config };
  tenantCache.set(keyHash, { data: resolved, expiresAt: Date.now() + CACHE_TTL_MS });

  return resolved;
}

export function clearTenantCache(): void {
  tenantCache.clear();
}
