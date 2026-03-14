import { describe, expect, it, vi } from "vitest";
import { NovitaProvider } from "../novita-provider";

describe("NovitaProvider", () => {
  const mockCreateMessage = vi.fn();
  const mockTestConnection = vi.fn();

  vi.mock("../openai-compatible-provider", () => ({
    OpenAICompatibleProvider: vi.fn().mockImplementation(() => ({
      createMessage: mockCreateMessage,
      testConnection: mockTestConnection,
    })),
  }));

  it("throws error if no API key is provided", () => {
    expect(() => {
      new NovitaProvider({
        type: "novita",
        model: "deepseek/deepseek-v3.2",
      } as any);
    }).toThrow("Novita API key is required");
  });

  it("creates provider with correct base URL and model", () => {
    new NovitaProvider({
      type: "novita",
      model: "deepseek/deepseek-v3.2",
      novitaApiKey: "test-key",
      novitaBaseUrl: "https://api.novita.ai/openai",
    } as any);
  });

  it("uses default model if no model is provided", () => {
    new NovitaProvider({
      type: "novita",
      novitaApiKey: "test-key",
    } as any);
  });
});
