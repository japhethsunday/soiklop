/**
 * Resolves the OpenAI-compatible endpoint and model names from configuration.
 *
 * Every AI feature in this codebase speaks the OpenAI chat-completions
 * protocol, but the service answering it is not necessarily OpenAI. NVIDIA
 * NIM, OpenRouter, Together, Groq, Azure OpenAI and a self-hosted vLLM all
 * serve the same protocol at a different base URL, under different model
 * names. Hard-coding `api.openai.com` and `gpt-*` meant a key issued by any
 * of them was sent to OpenAI's servers, which rejected it as invalid -- a
 * failure that reads as a bad key rather than a misdirected request.
 *
 * `OpenAiProvider` already took a `baseURL` for exactly this reason; these
 * helpers extend the same idea to the call sites that construct their own
 * clients.
 *
 * Every value falls back to what the code used before it was configurable,
 * so an existing OpenAI deployment behaves identically with nothing set.
 */

/** Empty rather than a fabricated key, so a missing key fails as a missing key. */
export const getOpenAiApiKey = (): string => process.env.OPENAI_API_KEY || '';

/**
 * `undefined` when unset, which leaves each client on its own default of
 * OpenAI's endpoint.
 */
export const getOpenAiBaseUrl = (): string | undefined =>
  process.env.OPENAI_BASE_URL?.trim() || undefined;

/**
 * The chat model. Callers pass the model they used before this was
 * configurable, so behaviour is unchanged when `OPENAI_MODEL` is unset.
 */
export const getOpenAiModel = (fallback: string): string =>
  process.env.OPENAI_MODEL?.trim() || fallback;

/**
 * Image generation is a separate endpoint that most OpenAI-compatible
 * gateways do not implement at all, so it is configured separately rather
 * than being assumed to follow the chat model.
 */
export const getOpenAiImageModel = (): string =>
  process.env.OPENAI_IMAGE_MODEL?.trim() || 'chatgpt-image-latest';

/** Whether an AI provider is configured at all. */
export const isOpenAiConfigured = (): boolean => !!getOpenAiApiKey();

/**
 * Extra JSON merged into every chat-completions request body.
 *
 * Gateways accept provider-specific parameters that the OpenAI schema has no
 * field for, and the SDKs drop anything they do not recognise. The one that
 * matters here is reasoning: a thinking model spends its token budget on a
 * reasoning stream returned outside `content`, so a caller that reads only
 * `content` gets an empty reply after a long wait -- which reads as "the AI
 * produced nothing" rather than as a parameter that needs setting.
 *
 * Kept as opaque JSON rather than named options so a gateway's parameters can
 * be set without teaching this codebase about any particular vendor. Example:
 *
 *   OPENAI_EXTRA_BODY={"chat_template_kwargs":{"thinking":false}}
 */
export const getOpenAiExtraBody = (): Record<string, unknown> | undefined => {
  const raw = process.env.OPENAI_EXTRA_BODY?.trim();
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    // Malformed configuration must not take down every AI request; the
    // request is still worth making without the extra parameters.
    return undefined;
  }
};

/**
 * A `fetch` that merges `OPENAI_EXTRA_BODY` into outgoing JSON request bodies.
 *
 * Both SDKs used here accept a `fetch` override but neither exposes a general
 * passthrough for unknown body parameters, so this is the one seam where a
 * gateway's own options can be applied to every call site at once. Returns the
 * global fetch unchanged when nothing is configured, so the default path is
 * untouched.
 */
export const createOpenAiFetch = (): typeof fetch | undefined => {
  const extraBody = getOpenAiExtraBody();
  if (!extraBody) {
    return undefined;
  }

  return async (input: any, init?: any) => {
    if (typeof init?.body !== 'string') {
      return fetch(input, init);
    }

    try {
      const body = JSON.parse(init.body);
      // Caller-supplied values win, so an explicit parameter is never
      // silently overridden by configuration.
      init = { ...init, body: JSON.stringify({ ...extraBody, ...body }) };
    } catch {
      // Not JSON (a file upload, say) -- pass it through untouched.
    }

    return fetch(input, init);
  };
};
