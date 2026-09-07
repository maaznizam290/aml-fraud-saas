/**
 * LLM provider abstraction (task section 5). investigationService.ts
 * depends only on this interface — it has no idea whether `ClaudeProvider`
 * or `DemoLLMProvider` (or, in the future, some other model) produced the
 * text it's about to parse. "Do not hard-code Claude throughout business
 * logic" is enforced structurally: nothing outside llm/claudeProvider.ts
 * imports @anthropic-ai/sdk.
 */

export interface LLMInvestigationRequest {
  systemPrompt: string;
  userPrompt: string;
  /** For audit/reconstruction — see docs/ORCHESTRATION.md "Auditability". */
  correlationId: string;
}

export interface LLMInvestigationResponse {
  rawText: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

export interface LLMProvider {
  readonly providerName: string;
  investigate(request: LLMInvestigationRequest): Promise<LLMInvestigationResponse>;
}
