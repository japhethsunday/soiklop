/**
 * Provider-agnostic AI contract.
 *
 * The foundation's `OpenAiService` constructs a module-level `new OpenAI(...)`
 * and hard-codes a model literal at every call site, so switching or adding a
 * provider means editing every method. This interface is the seam: features
 * depend on `AiProvider`, and which concrete provider serves a request is a
 * deployment decision made from configuration.
 *
 * Nothing here removes the existing OpenAiService -- it keeps working and keeps
 * serving the features already built on it.
 */

export type AiRole = 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  /** Instructions describing the assistant's role and constraints. */
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  /**
   * Model override. Omit to use the provider's configured default, which is
   * how callers stay provider-agnostic.
   */
  model?: string;
  /**
   * Requests a JSON object response. Providers that cannot enforce this
   * natively must still instruct the model to emit JSON.
   */
  json?: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiCompletionResponse {
  text: string;
  model: string;
  provider: string;
  usage?: AiUsage;
}

/**
 * Why a provider call failed, normalised across providers so retry and
 * user-messaging logic never has to parse vendor-specific error shapes.
 */
export type AiErrorKind =
  | 'authentication'
  | 'rate-limit'
  | 'timeout'
  | 'invalid-request'
  | 'content-filtered'
  | 'provider-unavailable'
  | 'unknown';

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
    readonly provider: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AiProviderError';
  }

  /**
   * True when retrying the identical request could plausibly succeed. A bad
   * API key or a malformed request never becomes valid on retry, so those
   * fail fast rather than burning the retry budget.
   */
  get retryable(): boolean {
    return (
      this.kind === 'rate-limit' ||
      this.kind === 'timeout' ||
      this.kind === 'provider-unavailable'
    );
  }
}

export interface AiProvider {
  /** Stable identifier used in configuration and logs, e.g. 'anthropic'. */
  readonly name: string;
  /** Model used when a request does not name one. */
  readonly defaultModel: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
