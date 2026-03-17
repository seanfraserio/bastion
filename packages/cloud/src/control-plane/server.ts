import Fastify from "fastify";
import { initializeDatabase } from "../db/client.js";
import { authenticateControlPlane } from "./auth.js";
import { tenantPublicRoutes, tenantAuthRoutes } from "./routes/tenants.js";
import { configRoutes } from "./routes/configs.js";
import { usageRoutes } from "./routes/usage.js";
import { auditRoutes } from "./routes/audit.js";
import { teamRoutes } from "./routes/team.js";
import { billingRoutes } from "./routes/billing.js";
import { webhookRoutes } from "./routes/webhooks.js";

export async function createControlPlane() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
  });

  // Initialize database with retry (Cloud SQL proxy may take a moment)
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await initializeDatabase();
      break;
    } catch (err) {
      console.warn(`Database init attempt ${attempt}/5 failed:`, (err as Error).message);
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  // Health check (no auth)
  app.get("/health", async () => ({ status: "ok", service: "bastion-control-plane" }));

  // Public routes (no auth)
  await app.register(tenantPublicRoutes);

  // Webhook routes (no tenant auth — uses Stripe signature verification)
  await app.register(webhookRoutes);

  // Authenticated routes
  app.register(async function authenticatedRoutes(authedApp) {
    authedApp.addHook("onRequest", authenticateControlPlane);
    await authedApp.register(tenantAuthRoutes);
    await authedApp.register(configRoutes);
    await authedApp.register(usageRoutes);
    await authedApp.register(auditRoutes);
    await authedApp.register(teamRoutes);
    await authedApp.register(billingRoutes);
  });

  return app;
}

