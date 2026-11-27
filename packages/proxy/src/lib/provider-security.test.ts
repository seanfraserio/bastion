import Fastify from "fastify";
import { expect, it } from "vitest";
import { isPrivateUrl } from "./provider-url.js";
import { registerSecurityHeaders } from "./security-headers.js";

it("classifies provider URL literals without network access", () => {
  for (const input of ["invalid", "http://localhost", "http://10.1.2.3", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://metadata.google.internal"]) expect(isPrivateUrl(input)).toBe(true);
  expect(isPrivateUrl("https://api.example.org")).toBe(false);
  expect(isPrivateUrl("https://1.1.1.1")).toBe(false);
});

it("preserves the proxy response header policy", async () => {
  const app = Fastify();
  try {
    registerSecurityHeaders(app);
    app.get("/", async () => "ok");
    const { headers } = await app.inject("/");
    expect(headers).toMatchObject({ "cache-control": "no-store", "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
    expect(headers["strict-transport-security"]).toBeUndefined();
  } finally { await app.close(); }
});
