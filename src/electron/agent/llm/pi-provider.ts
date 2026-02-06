import {
  getModel,
  getModels,
  getProviders,
  complete as piAiComplete,
  type Model,
  type Message as PiAiMessage,
  type Context as PiAiContext,
  type Tool as PiAiTool,
  type KnownProvider,
} from '@mariozechner/pi-ai';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMContent,
  LLMMessage,
  LLMTool,
  LLMToolResult,
  PI_PROVIDERS,
} from './types';

const DEFAULT_PI_PROVIDER: KnownProvider = 'anthropic';

/**
 * Pi provider implementation using pi-ai unified LLM API.
 *
 * Pi (by Mario Zechner) provides a unified interface to multiple LLM providers
 * including Anthropic, OpenAI, Google, xAI, Groq, Cerebras, OpenRouter, and more.
 * This provider lets CoWork OS route LLM calls through pi-ai's API layer.
 */
export class PiProvider implements LLMProvider {
  readonly type = 'pi' as const;
  private piProvider: KnownProvider;
  private apiKey: string;
  private modelId: string;

  constructor(config: LLMProviderConfig) {
    this.piProvider = (config.piProvider as KnownProvider) || DEFAULT_PI_PROVIDER;
    this.apiKey = config.piApiKey || '';
    this.modelId = config.model;

    if (!this.apiKey) {
      throw new Error(
        `Pi provider requires an API key for the ${this.piProvider} backend. Configure it in Settings.`
      );
    }

    console.log(
      `[Pi] Initialized with provider: ${this.piProvider}, model: ${this.modelId}`
    );
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Resolve the model from pi-ai's registry
      const model = this.resolveModel(request.model);

      console.log(
        `[Pi] Calling ${this.piProvider} with model: ${model.id} (requested: ${request.model})`
      );

      // Convert messages to pi-ai format
      const piAiMessages = this.convertMessagesToPiAi(request.messages);

      // Convert tools to pi-ai format
      const piAiTools = request.tools
        ? this.convertToolsToPiAi(request.tools)
        : undefined;

      // Build context
      const context: PiAiContext = {
        systemPrompt: request.system,
        messages: piAiMessages,
        tools: piAiTools,
      };

      // Make the API call using pi-ai
      const response = await piAiComplete(model, context, {
        apiKey: this.apiKey,
        maxTokens: request.maxTokens,
        signal: request.signal,
      });

      // Convert pi-ai response to CoWork OS format
      return this.convertPiAiResponse(response);
    } catch (error: any) {
      if (
        error.name === 'AbortError' ||
        error.message?.includes('aborted')
      ) {
        console.log(`[Pi] Request aborted`);
        throw new Error('Request cancelled');
      }

      console.error(`[Pi] API error (${this.piProvider}):`, {
        message: error.message,
        type: error.type || error.name,
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const model = this.resolveModel(this.modelId);

      await piAiComplete(
        model,
        {
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hi' }],
              timestamp: Date.now(),
            },
          ],
        },
        { apiKey: this.apiKey, maxTokens: 10 }
      );

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.message ||
          `Failed to connect to ${this.piProvider} via Pi`,
      };
    }
  }

  /**
   * Get available models for the configured Pi provider
   */
  static getAvailableModels(
    piProvider?: string
  ): Array<{ id: string; name: string; description: string }> {
    const provider = (piProvider as KnownProvider) || DEFAULT_PI_PROVIDER;
    try {
      const models = getModels(provider);
      return models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        description: `${PI_PROVIDERS[provider as keyof typeof PI_PROVIDERS]?.displayName || provider} - ${m.reasoning ? 'Reasoning model' : 'Standard model'} (${m.contextWindow.toLocaleString()} ctx)`,
      }));
    } catch (error: any) {
      console.error(`[Pi] Failed to get models for ${provider}:`, error);
      return [];
    }
  }

  /**
   * Get available Pi providers from pi-ai
   */
  static getAvailableProviders(): Array<{
    id: string;
    name: string;
  }> {
    try {
      const providers = getProviders();
      return providers.map((p) => ({
        id: p,
        name:
          PI_PROVIDERS[p as keyof typeof PI_PROVIDERS]?.displayName || p,
      }));
    } catch (error: any) {
      console.error('[Pi] Failed to get providers:', error);
      // Return fallback list
      return Object.entries(PI_PROVIDERS).map(([id, info]) => ({
        id,
        name: info.displayName,
      }));
    }
  }

  /**
   * Resolve model from pi-ai's registry
   */
  private resolveModel(modelId: string): Model<any> {
    try {
      const availableModels = getModels(this.piProvider);
      const found = availableModels.find((m) => m.id === modelId);
      if (found) {
        return found;
      }

      // Try partial match
      const partial = availableModels.find(
        (m) =>
          m.id.includes(modelId) || modelId.includes(m.id)
      );
      if (partial) {
        console.log(
          `[Pi] Exact model ${modelId} not found, using partial match: ${partial.id}`
        );
        return partial;
      }

      // Fall back to first available model
      if (availableModels.length > 0) {
        console.log(
          `[Pi] Model ${modelId} not found for ${this.piProvider}, using default: ${availableModels[0].id}`
        );
        return availableModels[0];
      }

      throw new Error(
        `No models available for provider ${this.piProvider}`
      );
    } catch (error) {
      throw new Error(
        `Failed to resolve model ${modelId} for provider ${this.piProvider}: ${error}`
      );
    }
  }

  /**
   * Convert messages to pi-ai format
   */
  private convertMessagesToPiAi(messages: LLMMessage[]): PiAiMessage[] {
    const result: PiAiMessage[] = [];
    const now = Date.now();

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        if (msg.role === 'user') {
          result.push({
            role: 'user',
            content: [{ type: 'text', text: msg.content }],
            timestamp: now,
          });
        } else {
          result.push({
            role: 'assistant',
            content: [{ type: 'text', text: msg.content }],
            api: 'openai-completions',
            provider: this.piProvider,
            model: this.modelId,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: 'stop',
            timestamp: now,
          });
        }
      } else if (Array.isArray(msg.content)) {
        // Check if this is a tool result array
        const toolResults = msg.content.filter(
          (item): item is LLMToolResult => item.type === 'tool_result'
        );

        if (toolResults.length > 0) {
          for (const toolResult of toolResults) {
            result.push({
              role: 'toolResult',
              toolCallId: toolResult.tool_use_id,
              toolName: '',
              content: [{ type: 'text', text: toolResult.content }],
              isError: toolResult.is_error || false,
              timestamp: now,
            });
          }
        } else {
          // Handle mixed content (text and tool_use)
          if (msg.role === 'user') {
            const textContent = msg.content
              .filter((item) => item.type === 'text')
              .map((item) => ({
                type: 'text' as const,
                text: (item as any).text,
              }));

            if (textContent.length > 0) {
              result.push({
                role: 'user',
                content: textContent,
                timestamp: now,
              });
            }
          } else {
            // Assistant message with tool calls
            const content: any[] = [];

            for (const item of msg.content) {
              if (item.type === 'text') {
                content.push({ type: 'text', text: (item as any).text });
              } else if (item.type === 'tool_use') {
                content.push({
                  type: 'toolCall',
                  id: (item as any).id,
                  name: (item as any).name,
                  arguments: (item as any).input,
                });
              }
            }

            if (content.length > 0) {
              result.push({
                role: 'assistant',
                content,
                api: 'openai-completions',
                provider: this.piProvider,
                model: this.modelId,
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0,
                  },
                },
                stopReason: 'stop',
                timestamp: now,
              });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Convert tools to pi-ai format
   */
  private convertToolsToPiAi(tools: LLMTool[]): PiAiTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as any,
    }));
  }

  /**
   * Convert pi-ai response to CoWork OS format
   */
  private convertPiAiResponse(response: any): LLMResponse {
    const content: LLMContent[] = [];

    if (response.content) {
      for (const block of response.content) {
        if (block.type === 'text') {
          content.push({
            type: 'text',
            text: block.text,
          });
        } else if (block.type === 'toolCall') {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.arguments || {},
          });
        }
        // Skip 'thinking' blocks - they're internal reasoning
      }
    }

    // Map stop reason
    let stopReason: LLMResponse['stopReason'] = 'end_turn';
    if (response.stopReason === 'toolUse') {
      stopReason = 'tool_use';
    } else if (response.stopReason === 'length') {
      stopReason = 'max_tokens';
    }

    return {
      content,
      stopReason,
      usage: response.usage
        ? {
            inputTokens: response.usage.input || 0,
            outputTokens: response.usage.output || 0,
          }
        : undefined,
    };
  }
}
