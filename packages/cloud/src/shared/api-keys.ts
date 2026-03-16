import { createHash, randomBytes } from "node:crypto";

// Generate a prefixed API key
// Control keys: bst_ctrl_<32 random hex chars>
// Proxy keys: bst_proxy_<32 random hex chars>
export function generateApiKey(prefix: "ctrl" | "proxy"): string {
  const random = randomBytes(32).toString("hex");
  return `bst_${prefix}_${random}`;
}

// Hash a key for storage (never store plaintext)
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Verify a key against a stored hash
export function verifyApiKey(key: string, hash: string): boolean {
  return hashApiKey(key) === hash;
}
