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

  // Initialize database
  await initializeDatabase();

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

// Entry point for Cloud Run
if (process.argv[1]?.includes("control-plane")) {
  const port = parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "0.0.0.0";

  createControlPlane().then((app) => {
    app.listen({ port, host }).then(() => {
      console.log(`Bastion Control Plane running on http://${host}:${port}`);
    });
  });
}
