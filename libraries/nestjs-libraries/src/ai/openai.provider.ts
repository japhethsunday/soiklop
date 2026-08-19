import OpenAI from 'openai';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
  AiProviderError,
} from '@gitroom/nestjs-libraries/ai/ai.provider.interface';
import { kindFromStatus } from '@gitroom/nestjs-libraries/ai/anthropic.provider';

export interface OpenAiProviderOptions {
  apiKey: string;
  defaultModel?: string;
  /**
   * Overrides the API base URL. Any OpenAI-compatible gateway (Azure OpenAI,
   * OpenRouter, Together, a self-hosted vLLM) is reached by setting this --
   * which is why there is no separate adapter class per compatible vendor.
   */
  baseURL?: string;
  /** Reported provider name, so logs distinguish compatible gateways. */
  name?: string;
  client?: Pick<OpenAI, 'chat'>;
}

export class OpenAiProvider implements AiProvider {
  readonly name: string;
  readonly defaultModel: string;

  private readonly client: Pick<OpenAI, 'chat'>;

  constructor(options: OpenAiProviderOptions) {
    this.name = options.name || 'openai';
    this.defaultModel = options.defaultModel || 'gpt-4.1';
    this.client =
      options.client ??
      new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  async complete(
    request: AiCompletionRequest
  ): Promise<AiCompletionResponse> {
    const model = request.model || this.defaultModel;

    try {
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: request.maxTokens ?? 16000,
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          ...(request.system
            ? [{ role: 'system' as const, content: request.system }]
            : []),
          ...request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      });

      const choice = response.choices?.[0];

      if (choice?.finish_reason === 'content_filter') {
        throw new AiProviderError(
          'The model declined to generate this content.',
          'content-filtered',
          this.name
        );
      }

      return {
        text: choice?.message?.content ?? '',
        model: response.model,
        provider: this.name,
        usage: response.usage && {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }

      const status = (error as { status?: number })?.status;
      throw new AiProviderError(
        (error as { message?: string })?.message ?? 'OpenAI request failed.',
        kindFromStatus(status),
        this.name,
        error
      );
    }
  }
}
