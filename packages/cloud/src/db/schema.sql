-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL,
  proxy_key_hash TEXT NOT NULL,
  provider_keys JSONB DEFAULT '{}',
  plan TEXT DEFAULT 'team' CHECK (plan IN ('free', 'team', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant configs
CREATE TABLE IF NOT EXISTS tenant_configs (
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  config JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id)
);

-- Usage logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'blocked', 'error')),
  duration_ms INTEGER DEFAULT 0,
  cache_hit BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_logs(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_tenants_proxy_key ON tenants(proxy_key_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
