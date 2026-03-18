import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

interface WeightedPattern {
  pattern: RegExp;
  weight: number;
}

const INJECTION_PATTERNS: WeightedPattern[] = [
  // Critical: "ignore instructions" patterns — weight 3
  { pattern: /ignore (((all|previous|above|prior) )*)?instructions/i, weight: 3 },
  { pattern: /disregard (your |the |all )?instructions/i, weight: 3 },
  // High: "system prompt" and "override" patterns — weight 2
  { pattern: /system prompt/i, weight: 2 },
  { pattern: /\[system\]/i, weight: 2 },
  { pattern: /override (your|the) (instructions|rules|guidelines)/i, weight: 2 },
  // Standard patterns — weight 1
  { pattern: /you are now/i, weight: 1 },
  { pattern: /new persona/i, weight: 1 },
  { pattern: /pretend (you are|to be)/i, weight: 1 },
  { pattern: /forget (everything|all|what)/i, weight: 1 },
  { pattern: /do not follow/i, weight: 1 },
  { pattern: /bypass (your|the|all)/i, weight: 1 },
  { pattern: /act as (if )?you (have no|don't have)/i, weight: 1 },
];

// Common leet speak substitutions
const LEET_MAP: Record<string, string> = {
  "1": "i",
  "3": "e",
  "0": "o",
  "4": "a",
  "5": "s",
  "7": "t",
};

/**
 * Normalize text before injection scoring:
 * 1. Strip zero-width characters
 * 2. Unicode NFKC normalization
 * 3. Convert common leet speak substitutions
 */
function normalizeForScoring(text: string): string {
  // Strip zero-width characters
  let normalized = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  // Unicode NFKC normalization
  normalized = normalized.normalize("NFKC");
  // Convert common leet speak substitutions
  normalized = normalized.replace(/[13045\u0037]/g, (ch) => LEET_MAP[ch] ?? ch);
  return normalized;
}

/**
 * Compute an injection risk score for the given text.
 * Score = sum of matched weights / sum of all weights, clamped to 1.0.
 * Critical patterns (e.g. "ignore instructions") are weighted higher.
 */
export function scoreInjection(text: string): number {
  if (!text) return 0;

  // Only do expensive NFKC normalization for longer texts (>100 chars).
  // Short messages are unlikely to contain obfuscated injection attacks.
  const normalized = text.length > 100
    ? normalizeForScoring(text)
    : text.toLowerCase();

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const { pattern, weight } of INJECTION_PATTERNS) {
    totalWeight += weight;
    if (pattern.test(normalized)) {
      matchedWeight += weight;
    }
  }

  return totalWeight === 0 ? 0 : Math.min(matchedWeight / totalWeight, 1.0);
}

export class InjectionDetectorMiddleware implements PipelineMiddleware {
  readonly name = "injection-detector";
  readonly phase = "request" as const;

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // Only concatenate and score user-role messages — system prompt is trusted content
    const userContent = ctx.request.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    const score = scoreInjection(userContent);
    ctx.metadata.injectionScore = score;

    // The injection detector does NOT block by itself --
    // that is handled by the policy middleware checking injection_score conditions.
    return { action: "continue", ctx };
  }
}
