/**
 * The only file in this codebase allowed to import @anthropic-ai/sdk — see
 * llm/provider.ts's module docstring. Swapping models is a config change
 * (`model` constructor param / CLAUDE_INVESTIGATION_MODEL env var), never a
 * business-logic change.
 */
import Anthropic from "@anthropic-ai/sdk";

import { LLMProviderError, type LLMInvestigationRequest, type LLMInvestigationResponse, type LLMProvider } from "./provider.js";
import { PROMPT_VERSION } from "./prompt.js";

export class ClaudeProvider implements LLMProvider {
  readonly providerName = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-5") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async investigate(request: LLMInvestigationRequest): Promise<LLMInvestigationResponse> {
    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }],
      });
    } catch (err) {
      throw new LLMProviderError(
        `Claude request failed: ${err instanceof Error ? err.message : String(err)}`,
        this.providerName
      );
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new LLMProviderError("Claude response contained no text content", this.providerName);
    }

    return {
      rawText: textBlock.text,
      provider: this.providerName,
      model: this.model,
      promptVersion: PROMPT_VERSION,
    };
  }
}
