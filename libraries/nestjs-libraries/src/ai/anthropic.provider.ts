import Anthropic from '@anthropic-ai/sdk';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiErrorKind,
  AiProvider,
  AiProviderError,
} from '@gitroom/nestjs-libraries/ai/ai.provider.interface';

export interface AnthropicProviderOptions {
  apiKey: string;
  defaultModel?: string;
  client?: Pick<Anthropic, 'messages'>;
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly defaultModel: string;

  private readonly client: Pick<Anthropic, 'messages'>;

  constructor(options: AnthropicProviderOptions) {
    this.defaultModel = options.defaultModel || 'claude-opus-5';
    this.client =
      options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  async complete(
    request: AiCompletionRequest
  ): Promise<AiCompletionResponse> {
    const model = request.model || this.defaultModel;

    // The Messages API has no JSON response-format switch, so the instruction
    // is appended to the system prompt instead.
    const system = request.json
      ? `${request.system ?? ''}\n\nRespond with a single valid JSON object and nothing else.`.trim()
      : request.system;

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 16000,
        ...(system ? { system } : {}),
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      if (response.stop_reason === 'refusal') {
        throw new AiProviderError(
          'The model declined to generate this content.',
          'content-filtered',
          this.name
        );
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        text,
        model: response.model,
        provider: this.name,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): AiProviderError {
    if (error instanceof AiProviderError) {
      return error;
    }

    const status = (error as { status?: number })?.status;
    const message =
      (error as { message?: string })?.message ?? 'Anthropic request failed.';

    return new AiProviderError(message, kindFromStatus(status), this.name, error);
  }
}

export function kindFromStatus(status?: number): AiErrorKind {
  if (status === 401 || status === 403) {
    return 'authentication';
  }
  if (status === 400 || status === 404 || status === 422) {
    return 'invalid-request';
  }
  if (status === 408) {
    return 'timeout';
  }
  if (status === 429) {
    return 'rate-limit';
  }
  if (status !== undefined && status >= 500) {
    return 'provider-unavailable';
  }
  return 'unknown';
}
