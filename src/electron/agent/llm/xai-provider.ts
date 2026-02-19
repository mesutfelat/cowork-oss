import { LLMProvider, LLMProviderConfig, LLMRequest, LLMResponse } from "./types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_XAI_MODEL = "grok-4-fast-non-reasoning";

export class XAIProvider implements LLMProvider {
  readonly type = "xai" as const;
  private client: OpenAICompatibleProvider;

  constructor(config: LLMProviderConfig) {
    const apiKey = config.xaiApiKey;
    if (!apiKey) {
      throw new Error("xAI API key is required. Configure it in Settings.");
    }

    const baseUrl = config.xaiBaseUrl || XAI_BASE_URL;

    this.client = new OpenAICompatibleProvider({
      type: "xai",
      providerName: "xAI",
      apiKey,
      baseUrl,
      defaultModel: config.model || DEFAULT_XAI_MODEL,
    });
  }

  createMessage(request: LLMRequest): Promise<LLMResponse> {
    return this.client.createMessage(request);
  }

  testConnection() {
    return this.client.testConnection();
  }

  getAvailableModels() {
    return this.client.getAvailableModels();
  }
}
