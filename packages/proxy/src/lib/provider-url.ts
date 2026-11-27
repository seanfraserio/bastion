import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

/** Check the configured URL literal, not the result of a DNS lookup. */
export function isPrivateUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") return true;
    return isIP(host) !== 0 && ipaddr.process(host).range() !== "unicast";
  } catch {
    return true;
  }
}
