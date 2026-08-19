import { Injectable } from '@nestjs/common';
import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
  AiProviderError,
} from '@gitroom/nestjs-libraries/ai/ai.provider.interface';
import { AnthropicProvider } from '@gitroom/nestjs-libraries/ai/anthropic.provider';
import { OpenAiProvider } from '@gitroom/nestjs-libraries/ai/openai.provider';

export interface AiServiceOptions {
  /** Attempts per request, including the first. 1 disables retrying. */
  maxAttempts?: number;
  /** Base backoff in milliseconds; doubles per attempt. */
  backoffMs?: number;
  /** Injected for tests so retry backoff does not consume real time. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Entry point for every AI feature.
 *
 * Providers are registered by name and one is designated the default, so
 * callers say "generate this" rather than naming a vendor. Retries apply only
 * to failures that could plausibly succeed on a second attempt -- an invalid
 * API key is surfaced immediately instead of being retried three times.
 */
@Injectable()
export class AiService {
  private readonly providers = new Map<string, AiProvider>();
  private defaultProviderName?: string;

  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: AiServiceOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffMs = options.backoffMs ?? 500;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  register(provider: AiProvider, asDefault = false): this {
    this.providers.set(provider.name, provider);

    if (asDefault || !this.defaultProviderName) {
      this.defaultProviderName = provider.name;
    }

    return this;
  }

  listProviders(): string[] {
    return [...this.providers.keys()];
  }

  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  getDefaultProviderName(): string | undefined {
    return this.defaultProviderName;
  }

  /** Designates an already-registered provider as the default. */
  setDefaultProvider(name: string): this {
    if (!this.providers.has(name)) {
      throw new AiProviderError(
        `Cannot default to unregistered AI provider "${name}".`,
        'invalid-request',
        name
      );
    }

    this.defaultProviderName = name;
    return this;
  }

  /**
   * Runs a completion, optionally against a named provider.
   *
   * A missing or unknown provider is a configuration error and is reported as
   * such, rather than silently falling back to whatever else is registered --
   * quietly answering with a different model than the caller asked for would
   * be harder to diagnose than failing.
   */
  async complete(
    request: AiCompletionRequest,
    providerName?: string
  ): Promise<AiCompletionResponse> {
    const name = providerName ?? this.defaultProviderName;

    if (!name) {
      throw new AiProviderError(
        'No AI provider is configured. Set an provider API key to enable ' +
          'AI features.',
        'invalid-request',
        'none'
      );
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new AiProviderError(
        `AI provider "${name}" is not registered. Available: ` +
          `${this.listProviders().join(', ') || 'none'}.`,
        'invalid-request',
        name
      );
    }

    return this.withRetries(provider, request);
  }

  private async withRetries(
    provider: AiProvider,
    request: AiCompletionRequest
  ): Promise<AiCompletionResponse> {
    let lastError: AiProviderError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await provider.complete(request);
      } catch (error) {
        const failure =
          error instanceof AiProviderError
            ? error
            : new AiProviderError(
                (error as { message?: string })?.message ?? 'AI request failed.',
                'unknown',
                provider.name,
                error
              );

        if (!failure.retryable || attempt === this.maxAttempts) {
          throw failure;
        }

        lastError = failure;
        await this.sleep(this.backoffMs * 2 ** (attempt - 1));
      }
    }

    // Unreachable: the loop either returns or throws. Kept so the compiler
    // sees a total function rather than an implicit undefined.
    throw lastError;
  }
}

/**
 * Builds an AiService from environment configuration.
 *
 * Every provider with credentials present is registered, so a deployment can
 * offer several. `AI_PROVIDER` names the default; when unset, Anthropic wins
 * if configured, otherwise OpenAI.
 */
export function createAiServiceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: AiServiceOptions = {}
): AiService {
  const service = new AiService(options);

  if (env.ANTHROPIC_API_KEY) {
    service.register(
      new AnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        defaultModel: env.ANTHROPIC_MODEL,
      })
    );
  }

  if (env.OPENAI_API_KEY) {
    service.register(
      new OpenAiProvider({
        apiKey: env.OPENAI_API_KEY,
        defaultModel: env.OPENAI_MODEL,
      })
    );
  }

  // An OpenAI-compatible gateway (Azure, OpenRouter, vLLM, ...) registered
  // under its own name so it can coexist with a direct OpenAI account.
  if (env.AI_COMPATIBLE_API_KEY && env.AI_COMPATIBLE_BASE_URL) {
    service.register(
      new OpenAiProvider({
        name: env.AI_COMPATIBLE_NAME || 'compatible',
        apiKey: env.AI_COMPATIBLE_API_KEY,
        baseURL: env.AI_COMPATIBLE_BASE_URL,
        defaultModel: env.AI_COMPATIBLE_MODEL,
      })
    );
  }

  const preferred = env.AI_PROVIDER;

  if (preferred && service.hasProvider(preferred)) {
    service.setDefaultProvider(preferred);
  }

  return service;
}
