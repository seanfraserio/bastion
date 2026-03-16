import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

/**
 * PII redaction middleware stub for the open-source edition.
 *
 * In the enterprise edition, this middleware uses ML-based PII detection
 * to identify and redact personally identifiable information in both
 * requests and responses.
 *
 * TODO: Enterprise ML-based PII detection integration
 */
export class PiiRedactMiddleware implements PipelineMiddleware {
  readonly name = "pii-redact";
  readonly phase = "both" as const;

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // OSS stub: always pass through
    return { action: "continue", ctx };
  }
}
