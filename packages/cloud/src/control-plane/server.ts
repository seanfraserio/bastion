import Fastify from "fastify";
import { initializeDatabase } from "../db/client.js";
import { authenticateControlPlane } from "./auth.js";
import { tenantRoutes } from "./routes/tenants.js";
import { configRoutes } from "./routes/configs.js";
import { usageRoutes } from "./routes/usage.js";

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

  // Tenant signup (no auth)
  await app.register(tenantRoutes);

  // Authenticated routes
  app.register(async function authenticatedRoutes(authedApp) {
    authedApp.addHook("onRequest", authenticateControlPlane);
    await authedApp.register(configRoutes);
    await authedApp.register(usageRoutes);
  });

  return app;
}

