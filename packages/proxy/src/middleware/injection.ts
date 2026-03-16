import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (((all|previous|above|prior) )*)?instructions/i,
  /disregard (your |the |all )?instructions/i,
  /you are now/i,
  /new persona/i,
  /pretend (you are|to be)/i,
  /system prompt/i,
  /\[system\]/i,
  /forget (everything|all|what)/i,
  /override (your|the) (instructions|rules|guidelines)/i,
  /do not follow/i,
  /bypass (your|the|all)/i,
  /act as (if )?you (have no|don't have)/i,
];

/**
 * Compute an injection risk score for the given text.
 * Score = number of matched patterns / total patterns, clamped to 1.0.
 */
export function scoreInjection(text: string): number {
  if (!text) return 0;

  let matched = 0;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matched += 1;
    }
  }

  return Math.min(matched / INJECTION_PATTERNS.length, 1.0);
}

export class InjectionDetectorMiddleware implements PipelineMiddleware {
  readonly name = "injection-detector";
  readonly phase = "request" as const;

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // Concatenate all user message content for scanning
    const userContent = ctx.request.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    const systemContent = ctx.request.systemPrompt ?? "";
    const fullText = `${systemContent}\n${userContent}`;

    const score = scoreInjection(fullText);
    ctx.metadata.injectionScore = score;

    // The injection detector does NOT block by itself --
    // that is handled by the policy middleware checking injection_score conditions.
    return { action: "continue", ctx };
  }
}
