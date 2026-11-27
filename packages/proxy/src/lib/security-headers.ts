import type { FastifyInstance } from "fastify";

/** Bastion may serve plain HTTP locally; leave HSTS to the TLS terminator. */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply) => {
    reply.headers({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cache-Control": "no-store",
    });
  });
}
