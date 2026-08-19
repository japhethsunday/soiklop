import {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
  AiProviderError,
} from '@gitroom/nestjs-libraries/ai/ai.provider.interface';
import {
  AiService,
  createAiServiceFromEnv,
} from '@gitroom/nestjs-libraries/ai/ai.service';
import { AnthropicProvider } from '@gitroom/nestjs-libraries/ai/anthropic.provider';
import { OpenAiProvider } from '@gitroom/nestjs-libraries/ai/openai.provider';

class FakeProvider implements AiProvider {
  readonly defaultModel = 'fake-model';
  calls: AiCompletionRequest[] = [];

  constructor(
    readonly name: string,
    private readonly behaviour: () => Promise<AiCompletionResponse>
  ) {}

  async complete(request: AiCompletionRequest) {
    this.calls.push(request);
    return this.behaviour();
  }
}

const ok = (text = 'generated'): AiCompletionResponse => ({
  text,
  model: 'fake-model',
  provider: 'fake',
  usage: { inputTokens: 10, outputTokens: 20 },
});

// Retry backoff is bypassed so the suite never actually waits.
const noSleep = () => Promise.resolve();

describe('AiService', () => {
  describe('provider selection', () => {
    it('routes to the default provider', async () => {
      const provider = new FakeProvider('anthropic', async () => ok());
      const service = new AiService({ sleep: noSleep }).register(provider);

      const result = await service.complete({
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result.text).toBe('generated');
      expect(provider.calls).toHaveLength(1);
    });

    it('routes to a named provider without disturbing the default', async () => {
      const first = new FakeProvider('anthropic', async () => ok('a'));
      const second = new FakeProvider('openai', async () => ok('b'));
      const service = new AiService({ sleep: noSleep })
        .register(first)
        .register(second);

      expect((await service.complete({ messages: [] }, 'openai')).text).toBe('b');
      expect(service.getDefaultProviderName()).toBe('anthropic');
    });

    it('makes the first registered provider the default', () => {
      const service = new AiService()
        .register(new FakeProvider('openai', async () => ok()))
        .register(new FakeProvider('anthropic', async () => ok()));

      expect(service.getDefaultProviderName()).toBe('openai');
    });

    it('fails clearly when no provider is configured', async () => {
      const service = new AiService();

      await expect(service.complete({ messages: [] })).rejects.toThrow(
        /No AI provider is configured/
      );
    });

    it('fails rather than silently substituting an unknown provider', async () => {
      const service = new AiService().register(
        new FakeProvider('anthropic', async () => ok())
      );

      await expect(
        service.complete({ messages: [] }, 'gemini')
      ).rejects.toThrow(/not registered/);
    });

    it('refuses to default to an unregistered provider', () => {
      expect(() => new AiService().setDefaultProvider('nope')).toThrow(
        AiProviderError
      );
    });
  });

  describe('retry behaviour', () => {
    it('retries a rate-limit failure and succeeds', async () => {
      let attempts = 0;
      const provider = new FakeProvider('anthropic', async () => {
        attempts++;
        if (attempts < 3) {
          throw new AiProviderError('slow down', 'rate-limit', 'anthropic');
        }
        return ok();
      });

      const service = new AiService({ sleep: noSleep }).register(provider);
      const result = await service.complete({ messages: [] });

      expect(result.text).toBe('generated');
      expect(attempts).toBe(3);
    });

    it('does not retry an authentication failure', async () => {
      let attempts = 0;
      const provider = new FakeProvider('anthropic', async () => {
        attempts++;
        throw new AiProviderError('bad key', 'authentication', 'anthropic');
      });

      const service = new AiService({ sleep: noSleep }).register(provider);

      await expect(service.complete({ messages: [] })).rejects.toMatchObject({
        kind: 'authentication',
      });
      expect(attempts).toBe(1);
    });

    it('does not retry an invalid request', async () => {
      let attempts = 0;
      const provider = new FakeProvider('anthropic', async () => {
        attempts++;
        throw new AiProviderError('bad', 'invalid-request', 'anthropic');
      });

      await expect(
        new AiService({ sleep: noSleep }).register(provider).complete({
          messages: [],
        })
      ).rejects.toBeInstanceOf(AiProviderError);
      expect(attempts).toBe(1);
    });

    it('gives up after the attempt limit and surfaces the failure', async () => {
      let attempts = 0;
      const provider = new FakeProvider('anthropic', async () => {
        attempts++;
        throw new AiProviderError('down', 'provider-unavailable', 'anthropic');
      });

      const service = new AiService({ maxAttempts: 2, sleep: noSleep }).register(
        provider
      );

      await expect(service.complete({ messages: [] })).rejects.toMatchObject({
        kind: 'provider-unavailable',
      });
      expect(attempts).toBe(2);
    });

    it('backs off for longer on each successive attempt', async () => {
      const delays: number[] = [];
      const provider = new FakeProvider('anthropic', async () => {
        throw new AiProviderError('slow down', 'rate-limit', 'anthropic');
      });

      const service = new AiService({
        maxAttempts: 4,
        backoffMs: 100,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }).register(provider);

      await expect(service.complete({ messages: [] })).rejects.toBeDefined();
      expect(delays).toEqual([100, 200, 400]);
    });

    it('wraps a non-AiProviderError thrown by a provider', async () => {
      const provider = new FakeProvider('anthropic', async () => {
        throw new TypeError('socket exploded');
      });

      const error = await new AiService({ sleep: noSleep })
        .register(provider)
        .complete({ messages: [] })
        .catch((e) => e);

      expect(error).toBeInstanceOf(AiProviderError);
      // An unknown failure is not retryable: without knowing the cause,
      // repeating the call risks duplicating a side effect.
      expect(error.kind).toBe('unknown');
    });
  });

  describe('error classification', () => {
    it('marks transient kinds retryable and terminal kinds not', () => {
      const kind = (k: any) => new AiProviderError('x', k, 'p').retryable;

      expect(kind('rate-limit')).toBe(true);
      expect(kind('timeout')).toBe(true);
      expect(kind('provider-unavailable')).toBe(true);
      expect(kind('authentication')).toBe(false);
      expect(kind('invalid-request')).toBe(false);
      expect(kind('content-filtered')).toBe(false);
    });
  });
});

describe('createAiServiceFromEnv', () => {
  it('registers nothing when no credentials are present', () => {
    const service = createAiServiceFromEnv({});

    expect(service.listProviders()).toEqual([]);
    expect(service.getDefaultProviderName()).toBeUndefined();
  });

  it('registers each provider that has credentials', () => {
    const service = createAiServiceFromEnv({
      ANTHROPIC_API_KEY: 'test-key',
      OPENAI_API_KEY: 'test-key',
    } as NodeJS.ProcessEnv);

    expect(service.listProviders()).toEqual(['anthropic', 'openai']);
  });

  it('honours AI_PROVIDER as the default', () => {
    const service = createAiServiceFromEnv({
      ANTHROPIC_API_KEY: 'test-key',
      OPENAI_API_KEY: 'test-key',
      AI_PROVIDER: 'openai',
    } as NodeJS.ProcessEnv);

    expect(service.getDefaultProviderName()).toBe('openai');
  });

  it('ignores AI_PROVIDER naming a provider with no credentials', () => {
    const service = createAiServiceFromEnv({
      OPENAI_API_KEY: 'test-key',
      AI_PROVIDER: 'anthropic',
    } as NodeJS.ProcessEnv);

    expect(service.getDefaultProviderName()).toBe('openai');
  });

  it('registers an OpenAI-compatible gateway under its own name', () => {
    const service = createAiServiceFromEnv({
      AI_COMPATIBLE_API_KEY: 'test-key',
      AI_COMPATIBLE_BASE_URL: 'https://gateway.example.com/v1',
      AI_COMPATIBLE_NAME: 'openrouter',
    } as NodeJS.ProcessEnv);

    expect(service.listProviders()).toEqual(['openrouter']);
  });

  it('does not register a gateway that is missing its base URL', () => {
    const service = createAiServiceFromEnv({
      AI_COMPATIBLE_API_KEY: 'test-key',
    } as NodeJS.ProcessEnv);

    expect(service.listProviders()).toEqual([]);
  });
});

describe('AnthropicProvider', () => {
  const fakeClient = (impl: (body: any) => any) =>
    ({ messages: { create: jest.fn(impl) } } as any);

  it('joins text blocks and reports usage', async () => {
    const client = fakeClient(async () => ({
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'thinking', thinking: 'ignored' },
        { type: 'text', text: 'world' },
      ],
      usage: { input_tokens: 5, output_tokens: 7 },
    }));

    const result = await new AnthropicProvider({
      apiKey: 'test-key',
      client,
    }).complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.text).toBe('Hello world');
    expect(result.provider).toBe('anthropic');
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  it('defaults to the current Opus model', () => {
    expect(new AnthropicProvider({ apiKey: 'k' }).defaultModel).toBe(
      'claude-opus-5'
    );
  });

  it('appends a JSON instruction to the system prompt when asked', async () => {
    const client = fakeClient(async () => ({
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{}' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));

    await new AnthropicProvider({ apiKey: 'test-key', client }).complete({
      system: 'You write captions.',
      json: true,
      messages: [{ role: 'user', content: 'go' }],
    });

    expect(client.messages.create.mock.calls[0][0].system).toContain(
      'valid JSON object'
    );
  });

  it('reports a refusal as content-filtered rather than an empty success', async () => {
    const client = fakeClient(async () => ({
      model: 'claude-opus-5',
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    }));

    await expect(
      new AnthropicProvider({ apiKey: 'test-key', client }).complete({
        messages: [],
      })
    ).rejects.toMatchObject({ kind: 'content-filtered' });
  });

  it.each([
    [401, 'authentication'],
    [429, 'rate-limit'],
    [400, 'invalid-request'],
    [503, 'provider-unavailable'],
  ])('maps HTTP %s to %s', async (status, kind) => {
    const client = fakeClient(async () => {
      throw Object.assign(new Error('boom'), { status });
    });

    await expect(
      new AnthropicProvider({ apiKey: 'test-key', client }).complete({
        messages: [],
      })
    ).rejects.toMatchObject({ kind });
  });
});

describe('OpenAiProvider', () => {
  const fakeClient = (impl: (body: any) => any) =>
    ({ chat: { completions: { create: jest.fn(impl) } } } as any);

  it('returns the first choice and reports usage', async () => {
    const client = fakeClient(async () => ({
      model: 'gpt-4.1',
      choices: [{ message: { content: 'hi there' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    }));

    const result = await new OpenAiProvider({
      apiKey: 'test-key',
      client,
    }).complete({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.text).toBe('hi there');
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
  });

  it('reports a content filter as an error, not empty text', async () => {
    const client = fakeClient(async () => ({
      model: 'gpt-4.1',
      choices: [{ message: { content: null }, finish_reason: 'content_filter' }],
    }));

    await expect(
      new OpenAiProvider({ apiKey: 'test-key', client }).complete({
        messages: [],
      })
    ).rejects.toMatchObject({ kind: 'content-filtered' });
  });

  it('reports a custom name so gateways are distinguishable in logs', () => {
    const provider = new OpenAiProvider({
      apiKey: 'test-key',
      name: 'openrouter',
      baseURL: 'https://example.com/v1',
    });

    expect(provider.name).toBe('openrouter');
  });
});
