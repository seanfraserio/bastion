import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey } from "./api-keys.js";

describe("api-keys", () => {
  describe("generateApiKey", () => {
    it("generates a control key with bst_ctrl_ prefix", () => {
      const key = generateApiKey("ctrl");
      expect(key).toMatch(/^bst_ctrl_[a-f0-9]{64}$/);
    });

    it("generates a proxy key with bst_proxy_ prefix", () => {
      const key = generateApiKey("proxy");
      expect(key).toMatch(/^bst_proxy_[a-f0-9]{64}$/);
    });

    it("generates unique keys on each call", () => {
      const key1 = generateApiKey("ctrl");
      const key2 = generateApiKey("ctrl");
      expect(key1).not.toBe(key2);
    });
  });

  describe("hashApiKey", () => {
    it("returns a consistent hash for the same input", () => {
      const key = "bst_ctrl_abc123";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it("returns a 64-char hex string (SHA-256)", () => {
      const hash = hashApiKey("test-key");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("verifyApiKey", () => {
    it("returns true for a matching key and hash", () => {
      const key = generateApiKey("proxy");
      const hash = hashApiKey(key);
      expect(verifyApiKey(key, hash)).toBe(true);
    });

    it("returns false for a non-matching key", () => {
      const key = generateApiKey("proxy");
      const hash = hashApiKey(key);
      const wrongKey = generateApiKey("proxy");
      expect(verifyApiKey(wrongKey, hash)).toBe(false);
    });
  });
});
