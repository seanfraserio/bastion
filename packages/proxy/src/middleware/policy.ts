import type { BastionConfig, Policy, PolicyCondition } from "@bastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  PolicyDecision,
} from "../pipeline/types.js";

/**
 * Evaluate a single condition against the given text.
 */
function evaluateCondition(
  condition: PolicyCondition,
  ctx: PipelineContext,
  text: string,
): boolean {
  switch (condition.type) {
    case "contains": {
      if (condition.case_sensitive) {
        return text.includes(condition.value);
      }
      return text.toLowerCase().includes(condition.value.toLowerCase());
    }

    case "regex": {
      const flags = condition.case_sensitive ? "" : "i";
      const re = new RegExp(condition.value, flags);
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
  phase: "request" | "response",
): string {
  // injection_score and pii_detected don't use field
  if (condition.type === "injection_score" || condition.type === "pii_detected") {
    return "";
  }

  const field = condition.field;
  const requestText = ctx.request.messages.map((m) => m.content).join("\n");
  const responseText = ctx.response?.content ?? "";

  if (field === "all") {
    return phase === "request" ? requestText : responseText;
  }
  if (field === "prompt") {
    return requestText;
  }
  if (field === "response") {
    return responseText;
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

  constructor(config: BastionConfig) {
    this.policies = config.policies ?? [];
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    const currentPhase: "request" | "response" = ctx.response
      ? "response"
      : "request";

    for (const policy of this.policies) {
      if (!shouldEvaluateInPhase(policy.on, currentPhase)) {
        continue;
      }

      const text = getTextField(policy.condition, ctx, currentPhase);
      const matched = evaluateCondition(policy.condition, ctx, text);

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
