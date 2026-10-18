/**
 * URL utilities - local implementation replacing @freelancer/shared-utils
 * Provides URL validation and private URL detection
 *
 * This classifies the URL hostname only. It does not resolve DNS, follow
 * redirects, or protect against DNS rebinding.
 */

/**
 * Check if a URL points to a private/internal network address
 * This helps prevent SSRF (Server-Side Request Forgery) attacks
 * @param url The URL to check
 * @returns true if the URL points to a private/internal address
 */
export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = normalizeHostname(parsed.hostname);

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      return true;
    }

    if (isIpAddress(hostname)) {
      return isPrivateIp(hostname);
    }

    // Check for metadata service endpoints (cloud provider metadata)
    // These are commonly targeted in SSRF attacks
    const metadataHosts = [
      "metadata.google.internal", // GCP metadata
      "metadata.azure.com", // Azure metadata
      "metadata", // Generic metadata
    ];
    if (metadataHosts.includes(hostname)) {
      return true;
    }

    return false;
  } catch {
    // If URL parsing fails, treat as potentially unsafe
    return true;
  }
}

/** Strip URL brackets and IPv6 zone IDs so address checks see the IP itself. */
function normalizeHostname(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  const zone = host.indexOf("%");
  if (zone !== -1) {
    host = host.slice(0, zone);
  }
  return host;
}

function isIpAddress(hostname: string): boolean {
  return hostname.includes(":") || parseIPv4(hostname) !== null;
}

function isPrivateIp(hostname: string): boolean {
  if (hostname.includes(":")) {
    return isPrivateIPv6(hostname);
  }
  const ipv4 = parseIPv4(hostname);
  return ipv4 !== null && isPrivateIPv4(ipv4);
}

/**
 * Parse dotted, short, hex, octal, and decimal IPv4 forms into a 32-bit value.
 * Returns null when the hostname is not an IPv4 address.
 */
function parseIPv4(hostname: string): number | null {
  if (hostname.length === 0 || hostname.includes(":")) {
    return null;
  }

  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
      return null;
    }
    return value;
  }

  const parts = hostname.split(".");
  if (parts.length < 2 || parts.length > 4) {
    return null;
  }

  const widths = [24, 16, 8, 0].slice(4 - parts.length);
  let value = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parseIPv4Part(parts[i]);
    const max = i === parts.length - 1 ? 2 ** (widths[i] + 8) - 1 : 255;
    if (part === null || part > max) {
      return null;
    }
    value += part * 2 ** widths[i];
  }
  return value >>> 0;
}

function parseIPv4Part(part: string): number | null {
  if (part.length === 0) {
    return null;
  }
  const isHex = /^0x[0-9a-f]+$/i.test(part);
  const isOctal = !isHex && part.length > 1 && part.startsWith("0") && /^[0-7]+$/.test(part);
  const isDecimal = /^[0-9]+$/.test(part);
  if (!isHex && !isOctal && !isDecimal) {
    return null;
  }
  const value = isHex ? parseInt(part, 16) : isOctal ? parseInt(part, 8) : Number(part);
  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function isPrivateIPv4(value: number): boolean {
  const a = (value >>> 24) & 0xff;
  const b = (value >>> 16) & 0xff;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const mapped = extractMappedIPv4(hostname);
  if (mapped !== null) {
    return isPrivateIPv4(mapped);
  }

  const groups = expandIPv6(hostname);
  if (!groups) {
    // Unparseable IP-shaped hostnames are treated as unsafe.
    return true;
  }

  const first = groups[0];
  if (groups.every((group) => group === 0)) return true; // :: unspecified
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/** ::ffff:0:0/96 IPv4-mapped addresses, in dotted or hex form. */
function extractMappedIPv4(hostname: string): number | null {
  const dotted = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted) {
    return parseIPv4(dotted[1]);
  }

  const groups = expandIPv6(hostname);
  if (!groups) {
    return null;
  }
  const prefix = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!prefix) {
    return null;
  }
  return ((groups[6] << 16) | groups[7]) >>> 0;
}

function expandIPv6(hostname: string): number[] | null {
  if (!hostname.includes(":")) {
    return null;
  }
  const zoneStripped = hostname.split("%")[0];
  if (zoneStripped.includes(".")) {
    // Dotted IPv4 tails are only accepted through the mapped-address parser.
    return null;
  }
  const halves = zoneStripped.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (head.some((part) => !isHextet(part)) || tail.some((part) => !isHextet(part))) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1) {
    if (missing !== 0) return null;
    return head.map((part) => parseInt(part, 16));
  }
  if (missing < 0) {
    return null;
  }
  return [...head, ...Array(missing).fill(0), ...tail].map((part) =>
    typeof part === "number" ? part : parseInt(part, 16),
  );
}

function isHextet(part: string): boolean {
  return /^[0-9a-f]{1,4}$/i.test(part);
}
