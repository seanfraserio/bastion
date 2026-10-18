import { describe, it, expect } from "vitest";
import { isPrivateUrl } from "./url-utils.js";

describe("isPrivateUrl", () => {
  describe("loopback, unspecified, and link-local", () => {
    it.each([
      "http://localhost",
      "http://localhost:11434",
      "http://127.0.0.1",
      "http://127.0.0.2",
      "http://127.255.255.255",
      "http://0.0.0.0",
      "http://[::1]",
      "http://[::1]:8080",
      "http://[::]",
      "http://[0:0:0:0:0:0:0:1]",
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:7f00:1]",
      "http://169.254.1.1",
      "http://[fe80::1]",
      "http://[fe80::1%25eth0]",
    ])("treats %s as private", (url) => {
      expect(isPrivateUrl(url)).toBe(true);
    });
  });

  describe("private and unique-local ranges", () => {
    it.each([
      "http://10.0.0.1",
      "http://10.255.255.255",
      "http://172.16.0.1",
      "http://172.31.255.255",
      "http://192.168.1.1",
      "http://[fc00::1]",
      "http://[fd00::1]",
      "http://[fd12:3456:789a::1]",
      "http://[::ffff:10.0.0.1]",
      "http://[::ffff:192.168.0.1]",
      "http://[::ffff:c0a8:1]",
    ])("treats %s as private", (url) => {
      expect(isPrivateUrl(url)).toBe(true);
    });
  });

  describe("numeric and mapped IPv4 normalization", () => {
    it.each([
      "http://2130706433", // 127.0.0.1
      "http://0x7f000001", // 127.0.0.1
      "http://0177.0.0.1", // octal 127.0.0.1
      "http://127.1", // 127.0.0.1 short form
      "http://[::ffff:127.0.0.2]",
    ])("treats normalized private address %s as private", (url) => {
      expect(isPrivateUrl(url)).toBe(true);
    });

    it("does not treat a public numeric IPv4 as private", () => {
      // 8.8.8.8
      expect(isPrivateUrl("http://134744072")).toBe(false);
    });
  });

  describe("public hosts and DNS names that only look like IPv6 prefixes", () => {
    it.each([
      "https://example.com",
      "https://api.openai.com",
      "https://fda.gov",
      "https://fc.example.com",
      "https://fd.example.com",
      "https://fe80.example.com",
      "https://feb.example.com",
      "http://8.8.8.8",
      "http://1.1.1.1",
      "http://172.15.0.1",
      "http://172.32.0.1",
      "http://192.169.1.1",
      "http://[2001:4860:4860::8888]",
      "http://[2606:4700:4700::1111]",
    ])("treats %s as public", (url) => {
      expect(isPrivateUrl(url)).toBe(false);
    });
  });

  describe("metadata endpoints and unparseable input", () => {
    it.each([
      "http://169.254.169.254",
      "http://metadata.google.internal",
      "http://metadata.azure.com",
      "http://metadata",
      "not a url",
      "",
    ])("treats %s as private", (url) => {
      expect(isPrivateUrl(url)).toBe(true);
    });
  });
});
