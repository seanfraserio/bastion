import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
  ProviderConfig,
  ProviderName,
} from "../pipeline/types.js";

export class BedrockProvider implements IProvider {
  readonly name: ProviderName = "bedrock";

  async forward(
    _request: NormalizedRequest,
    _rawBody: unknown,
    _config: ProviderConfig,
  ): Promise<NormalizedResponse> {
    throw new Error("Bedrock provider not yet implemented");
  }

  supports(_model: string): boolean {
    return false;
  }

  estimateCost(
    _inputTokens: number,
    _outputTokens: number,
    _model: string,
  ): number {
    return 0;
  }
}
