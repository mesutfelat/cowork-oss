import { LLMProvider, LLMProviderConfig, LLMRequest, LLMResponse } from "./types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";

const NOVITA_BASE_URL = "https://api.novita.ai/openai";
const DEFAULT_NOVITA_MODEL = "deepseek/deepseek-v3.2";

export class NovitaProvider implements LLMProvider {
  readonly type = "novita" as const;
  private client: OpenAICompatibleProvider;

  constructor(config: LLMProviderConfig) {
    const apiKey = config.novitaApiKey;
    if (!apiKey) {
      throw new Error("Novita API key is required. Configure it in Settings.");
    }

    const baseUrl = config.novitaBaseUrl || NOVITA_BASE_URL;

    this.client = new OpenAICompatibleProvider({
      type: "novita",
      providerName: "Novita",
      apiKey,
      baseUrl,
      defaultModel: config.model || DEFAULT_NOVITA_MODEL,
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
