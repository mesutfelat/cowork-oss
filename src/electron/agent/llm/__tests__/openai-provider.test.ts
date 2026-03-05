import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMProviderConfig, LLMRequest } from "../types";
import { OpenAIProvider } from "../openai-provider";

const completeMock = vi.fn();
const getModelsMock = vi.fn();
const getApiKeyFromTokensMock = vi.fn();
const loadPiAiModuleMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function OpenAIClientMock() {
    this.chat = {
      completions: {
        create: vi.fn(),
      },
    };
  }),
}));

vi.mock("../pi-ai-loader", () => ({
  loadPiAiModule: (...args: Any[]) => loadPiAiModuleMock(...args),
}));

vi.mock("../openai-oauth", () => ({
  OpenAIOAuth: {
    getApiKeyFromTokens: (...args: Any[]) => getApiKeyFromTokensMock(...args),
  },
}));

function makeConfig(): LLMProviderConfig {
  return {
    type: "openai",
    model: "gpt-5.3-codex-spark",
    openaiAccessToken: "header.payload.signature",
    openaiRefreshToken: "refresh-token",
    openaiTokenExpiresAt: Date.now() + 60_000,
  };
}

function makeRequest(): LLMRequest {
  return {
    model: "gpt-5.3-codex-spark",
    maxTokens: 512,
    system: "system",
    messages: [{ role: "user", content: "test" }],
  };
}

describe("OpenAIProvider structured errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModelsMock.mockReturnValue([{ id: "gpt-5.3-codex-spark" }]);
    getApiKeyFromTokensMock.mockResolvedValue({ apiKey: "test-key", newTokens: null });
    loadPiAiModuleMock.mockResolvedValue({
      getModels: (...args: Any[]) => getModelsMock(...args),
      complete: (...args: Any[]) => completeMock(...args),
    });
  });

  it("marks terminated OAuth stopReason errors as retryable", async () => {
    completeMock.mockResolvedValue({
      stopReason: "error",
      errorMessage: "terminated",
      content: [],
    });

    const provider = new OpenAIProvider(makeConfig());
    const request = makeRequest();

    await expect(provider.createMessage(request)).rejects.toMatchObject({
      retryable: true,
      phase: "oauth",
      code: "PI_AI_ERROR",
    });
  });

  it("wraps stream interruption exceptions with retryable metadata", async () => {
    completeMock.mockRejectedValue(new Error("stream disconnected by upstream"));

    const provider = new OpenAIProvider(makeConfig());
    const request = makeRequest();

    await expect(provider.createMessage(request)).rejects.toMatchObject({
      retryable: true,
      phase: "oauth",
    });
  });
});
