/**
 * Security headers utility - local implementation replacing @freelancer/shared-utils/security-headers
 * Adds standard security headers to Fastify responses
 */

import type { FastifyInstance } from "fastify";

export interface SecurityHeadersOptions {
  hsts?: boolean;
}

/**
 * Register security headers on all responses
 * @param app Fastify instance
 * @param options Configuration options
 */
export async function registerSecurityHeaders(
  app: FastifyInstance,
  options: SecurityHeadersOptions = { hsts: false },
): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    // Prevent MIME type sniffing
    reply.header("X-Content-Type-Options", "nosniff");

    // Prevent caching of sensitive responses
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");

    // Prevent framing
    reply.header("X-Frame-Options", "DENY");

    // XSS protection (legacy but harmless)
    reply.header("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    reply.header("Referrer-Policy", "no-referrer");

    // HSTS - only enable if explicitly requested (requires HTTPS)
    if (options.hsts) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    return payload;
  });
}