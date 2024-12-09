import { type AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

const MAX_TOKENS = 2048;

type ProviderName = "anthropic";

export class LLM {
  apiKey: string;
  provider: AnthropicProvider;
  modelName: string;

  constructor(apiKey: string, providerName: ProviderName, modelName: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;

    // if (providerName === "anthropic") {
    this.provider = createAnthropic({ apiKey: this.apiKey });
    // }
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    this.provider = createAnthropic({ apiKey: this.apiKey });
  }

  setProvider(providerName: ProviderName) {
    if (providerName === "anthropic") {
      this.provider = createAnthropic({ apiKey: this.apiKey });
    }
  }

  setModel(modelName: string) {
    this.modelName = modelName;
  }

  streamText(prompt: string) {
    return streamText({
      model: this.provider(this.modelName),
      prompt,
      maxTokens: MAX_TOKENS,
    });
  }
}
