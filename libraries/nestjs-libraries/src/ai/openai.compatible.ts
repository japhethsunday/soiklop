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
