import { ProviderUnavailableError } from './payment-provider.js';

export interface ProviderHttpResponse {
  status: number;
  json: any;
}

/**
 * fetch() with a hard timeout, classifying failures the way payments need:
 * - timeout, network error, 429 or 5xx -> ProviderUnavailableError (outcome unknown, retry later)
 * - any other status is returned for the adapter to interpret
 */
export async function callProvider(
  provider: string,
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: unknown;
  },
  timeoutMs: number,
): Promise<ProviderHttpResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new ProviderUnavailableError(
      provider,
      timedOut
        ? `no response within ${timeoutMs} ms`
        : `network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 429 || response.status >= 500) {
    throw new ProviderUnavailableError(provider, `HTTP ${response.status}`);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }

  return { status: response.status, json };
}

/** Caches an OAuth access token until shortly before it expires. */
export class TokenCache {
  private value?: string;
  private expiresAt = 0;

  async get(
    fetchToken: () => Promise<{ token: string; expiresInSeconds: number }>,
  ) {
    if (!this.value || Date.now() >= this.expiresAt) {
      const { token, expiresInSeconds } = await fetchToken();
      this.value = token;
      // Renew a minute early so a token never expires mid-request.
      this.expiresAt = Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000;
    }

    return this.value;
  }
}
