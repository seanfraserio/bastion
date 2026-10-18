import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerSecurityHeaders } from "./security-headers.js";

async function appWithHeaders(hsts?: boolean) {
  const app = Fastify();
  await registerSecurityHeaders(app, hsts === undefined ? {} : { hsts });
  app.get("/probe", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("registerSecurityHeaders", () => {
  it("sets baseline security headers and omits HSTS by default", async () => {
    const app = await appWithHeaders();
    const res = await app.inject({ method: "GET", url: "/probe" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-xss-protection"]).toBe("1; mode=block");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(res.headers["expires"]).toBe("0");
    expect(res.headers["strict-transport-security"]).toBeUndefined();

    await app.close();
  });

  it("omits HSTS when explicitly disabled", async () => {
    const app = await appWithHeaders(false);
    const res = await app.inject({ method: "GET", url: "/probe" });

    expect(res.headers["strict-transport-security"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");

    await app.close();
  });

  it("sets HSTS only when opted in", async () => {
    const app = await appWithHeaders(true);
    const res = await app.inject({ method: "GET", url: "/probe" });

    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(res.headers["x-frame-options"]).toBe("DENY");

    await app.close();
  });
});
