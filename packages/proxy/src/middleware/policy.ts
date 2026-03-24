import pino from "pino";
import type { BastionConfig, Policy, PolicyCondition } from "@openbastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  PolicyDecision,
} from "../pipeline/types.js";

const logger = pino({ name: "bastion:policy" });

/**
 * Check if a regex pattern contains known catastrophic backtracking indicators.
 * Rejects patterns with nested quantifiers like (a+)+, (a*)*,  (a+)*, etc.
 */
export function validateRegexSafety(pattern: string): boolean {
  // Detect nested quantifiers: a group containing a quantifier, followed by a quantifier
  // e.g. (a+)+, (a+)*, (a*)+, (a*)*,  (a{2,})+, etc.
  const nestedQuantifier = /\([^)]*[+*}]\)[+*{]/;
  return !nestedQuantifier.test(pattern);
}

/**
 * Evaluate a single condition against the given text.
 * Uses pre-compiled regexes from the provided map.
 */
function evaluateCondition(
  condition: PolicyCondition,
  ctx: PipelineContext,
  text: string,
  compiledRegexes: Map<string, RegExp>,
): boolean {
  switch (condition.type) {
    case "contains": {
      if (condition.case_sensitive) {
        return text.includes(condition.value);
      }
      return text.toLowerCase().includes(condition.value.toLowerCase());
    }

    case "regex": {
      const re = compiledRegexes.get(condition.value);
      if (!re) {
        // Pattern was invalid or unsafe — treat as non-matching
        return false;
      }
      return re.test(text);
    }

    case "length_exceeds": {
      return text.length > condition.value;
    }

    case "injection_score": {
      const score =
        typeof ctx.metadata.injectionScore === "number"
          ? ctx.metadata.injectionScore
          : 0;
      return score >= condition.threshold;
    }

    case "pii_detected": {
      // OSS stub: PII detection is an enterprise feature.
      // Always returns false so the decision will be "warn" at most.
      return false;
    }

    default:
      return false;
  }
}

/**
 * Get the text content to evaluate a condition against, based on the
 * condition's field setting and the current pipeline phase.
 */
function getTextField(
  condition: PolicyCondition,
  ctx: PipelineContext,
): string {
  // injection_score and pii_detected don't use field
  if (condition.type === "injection_score" || condition.type === "pii_detected") {
    return "";
  }

  const field = condition.field;

  if (field === "response") {
    return ctx.response?.content ?? "";
  }

  const requestText = ctx.request.messages.map((m) => m.content).join("\n");

  if (field === "prompt") {
    return requestText;
  }

  if (field === "all") {
    const responseText = ctx.response?.content ?? "";
    return [requestText, responseText].filter(Boolean).join("\n");
  }

  return "";
}

/**
 * Determine if a policy should be evaluated in the current phase.
 */
function shouldEvaluateInPhase(
  policyOn: "request" | "response" | "both",
  currentPhase: "request" | "response",
): boolean {
  if (policyOn === "both") return true;
  return policyOn === currentPhase;
}

export class PolicyMiddleware implements PipelineMiddleware {
  readonly name = "policy";
  readonly phase = "both" as const;

  private policies: Policy[];
  private compiledRegexes = new Map<string, RegExp>();

  constructor(config: BastionConfig) {
    this.policies = config.policies ?? [];

    // Pre-compile all regex patterns at construction time
    for (const policy of this.policies) {
      if (policy.condition.type === "regex") {
        const pattern = policy.condition.value;
        const flags = policy.condition.case_sensitive ? "" : "i";

        // Check for catastrophic backtracking
        if (!validateRegexSafety(pattern)) {
          logger.warn(
            `[policy] Unsafe regex pattern in policy "${policy.name}": ` +
            `"${pattern}" contains nested quantifiers that may cause catastrophic backtracking. ` +
            `This policy will be treated as non-matching.`,
          );
          continue;
        }

        try {
          const re = new RegExp(pattern, flags);
          this.compiledRegexes.set(pattern, re);
        } catch (err) {
          logger.warn(
            `[policy] Invalid regex pattern in policy "${policy.name}": ` +
            `"${pattern}" — ${err instanceof Error ? err.message : String(err)}. ` +
            `This policy will be treated as non-matching.`,
          );
        }
      }
    }
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    const currentPhase: "request" | "response" = ctx.response
      ? "response"
      : "request";

    for (const policy of this.policies) {
      if (!shouldEvaluateInPhase(policy.on, currentPhase)) {
        continue;
      }

      const text = getTextField(policy.condition, ctx);
      const matched = evaluateCondition(policy.condition, ctx, text, this.compiledRegexes);

      const decision: PolicyDecision = {
        policyName: policy.name,
        matched,
        action: matched ? policy.action : undefined,
        reason: matched
          ? `Policy "${policy.name}" matched with action "${policy.action}"`
          : undefined,
        timestamp: Date.now(),
      };

      ctx.decisions.push(decision);

      if (matched && policy.action === "block") {
        return {
          action: "block",
          reason: `Blocked by policy "${policy.name}": ${decision.reason}`,
          statusCode: 403,
        };
      }
    }

    return { action: "continue", ctx };
  }
}
