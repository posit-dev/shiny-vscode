import { type AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import { type OpenAIProvider, createOpenAI } from "@ai-sdk/openai";
import { type CoreMessage, streamText } from "ai";

const MAX_TOKENS = 2048;

type ProviderName = "anthropic" | "openai";

export class LLM {
  apiKey: string;
  providerName: ProviderName;
  provider: AnthropicProvider | OpenAIProvider;
  modelName: string;

  constructor(providerName: ProviderName, modelName: string, apiKey: string) {
    this.providerName = providerName;
    this.modelName = modelName;
    this.apiKey = apiKey;

    if (providerName === "anthropic") {
      this.provider = createAnthropic({ apiKey: this.apiKey });
    } else if (providerName === "openai") {
      this.provider = createOpenAI({ apiKey: this.apiKey });
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  streamText({
    system,
    messages,
  }: {
    system: string;
    messages: Array<CoreMessage>;
  }) {
    return streamText({
      model: this.provider(this.modelName),
      system,
      messages,
      maxTokens: MAX_TOKENS,
    });
  }
}

/**
 * Determines the provider name based on the model name.
 *
 * @param modelName - The name of the model.
 * @returns The provider name that corresponds to the given model name, or null
 * if the model name is not supported.
 */
export function providerNameFromModelName(
  modelName: string
): ProviderName | null {
  if (modelName.startsWith("gpt-")) {
    return "openai";
  } else if (modelName.startsWith("claude-")) {
    return "anthropic";
  } else {
    return null;
  }
}
/**
 * Returns the proper name for the given provider.
 *
 * @param providerName - The provider name to convert. If the provider name is
 * unknown or not supported, it will be returned as is.
 * @returns A string representation of the provider name.
 */

export function getProperProviderName(
  providerName: ProviderName | null
): string {
  if (providerName === "openai") {
    return "OpenAI";
  } else if (providerName === "anthropic") {
    return "Anthropic";
  } else {
    return "Unknown LLM provider";
  }
}
