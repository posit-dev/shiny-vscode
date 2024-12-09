import { type AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import { type OpenAIProvider, createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const MAX_TOKENS = 2048;

type ProviderName = "anthropic" | "openai";

export class LLM {
  apiKey: string;
  providerName: ProviderName;
  provider: AnthropicProvider | OpenAIProvider;
  modelName: string;

  constructor(apiKey: string, providerName: ProviderName, modelName: string) {
    this.apiKey = apiKey;
    this.providerName = providerName;
    this.modelName = modelName;

    if (providerName === "anthropic") {
      this.provider = createAnthropic({ apiKey: this.apiKey });
    } else if (providerName === "openai") {
      this.provider = createOpenAI({ apiKey: this.apiKey });
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  streamText(prompt: string) {
    return streamText({
      model: this.provider(this.modelName),
      prompt,
      maxTokens: MAX_TOKENS,
    });
  }
}

/**
 * Determines the provider name based on the model name.
 *
 * @param modelName - The name of the model.
 * @returns The provider name that corresponds to the given model name.
 * @throws {Error} If the model name does not match any known providers.
 */
export function providerNameFromModelName(modelName: string): ProviderName {
  if (modelName.startsWith("gpt-")) {
    return "openai";
  } else if (modelName.startsWith("claude-")) {
    return "anthropic";
  } else {
    throw new Error(`Unknown model: ${modelName}`);
  }
}
