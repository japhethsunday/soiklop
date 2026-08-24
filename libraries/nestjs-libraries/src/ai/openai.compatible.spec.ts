import {
  createOpenAiFetch,
  getOpenAiExtraBody,
} from '@gitroom/nestjs-libraries/ai/openai.compatible';

describe('OPENAI_EXTRA_BODY', () => {
  const original = process.env.OPENAI_EXTRA_BODY;
  afterEach(() => {
    if (original === undefined) delete process.env.OPENAI_EXTRA_BODY;
    else process.env.OPENAI_EXTRA_BODY = original;
    jest.restoreAllMocks();
  });

  it('leaves fetch untouched when nothing is configured', () => {
    delete process.env.OPENAI_EXTRA_BODY;
    expect(createOpenAiFetch()).toBeUndefined();
  });

  it('ignores malformed JSON rather than breaking every request', () => {
    process.env.OPENAI_EXTRA_BODY = '{not json';
    expect(getOpenAiExtraBody()).toBeUndefined();
    expect(createOpenAiFetch()).toBeUndefined();
  });

  it('merges configured parameters into the request body', async () => {
    process.env.OPENAI_EXTRA_BODY =
      '{"chat_template_kwargs":{"thinking":false}}';
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await createOpenAiFetch()!('https://x/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [] }),
    } as any);

    const sent = JSON.parse((spy.mock.calls[0][1] as any).body);
    expect(sent.chat_template_kwargs).toEqual({ thinking: false });
    expect(sent.model).toBe('m');
  });

  it('never overrides a value the caller set explicitly', async () => {
    process.env.OPENAI_EXTRA_BODY = '{"temperature":0.1}';
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await createOpenAiFetch()!('https://x/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ temperature: 0.9 }),
    } as any);

    expect(JSON.parse((spy.mock.calls[0][1] as any).body).temperature).toBe(0.9);
  });

  it('passes non-JSON bodies through untouched', async () => {
    process.env.OPENAI_EXTRA_BODY = '{"a":1}';
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await createOpenAiFetch()!('https://x/v1/files', {
      method: 'POST',
      body: 'not-json',
    } as any);

    expect((spy.mock.calls[0][1] as any).body).toBe('not-json');
  });
});
