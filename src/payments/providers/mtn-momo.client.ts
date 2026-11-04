import { PaymentProvider, PaymentStatus } from '../payment.enums.js';
import {
  CollectionRequest,
  PaymentProviderClient,
  ProviderRejectedError,
  ProviderStatusReport,
  toInternationalMsisdn,
} from './payment-provider.js';
import { callProvider, TokenCache } from './provider-http.js';

export interface MtnMomoOptions {
  /** https://sandbox.momodeveloper.mtn.com, or the production host MTN gives you. */
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  /** "sandbox", or e.g. "mtnrwanda" in production. */
  targetEnvironment: string;
  timeoutMs: number;
}

/**
 * MTN MoMo Collection API (request-to-pay).
 *
 *   POST {base}/collection/token/                      Basic apiUser:apiKey -> access_token
 *   POST {base}/collection/v1_0/requesttopay           202 Accepted, empty body
 *        X-Reference-Id: <our transactionId, a UUID>    MTN's idempotency key
 *        X-Callback-Url: <our /api/payments/callbacks>
 *   GET  {base}/collection/v1_0/requesttopay/{id}       { status: PENDING|SUCCESSFUL|FAILED, ... }
 *
 * MTN's own callback format differs from our normalized callback. In production, a
 * thin gateway or a per-provider mapper converts and signs it (see docs/ARCHITECTURE.md).
 */
export class MtnMomoClient implements PaymentProviderClient {
  readonly provider = PaymentProvider.Mtn;
  private readonly token = new TokenCache();

  constructor(private readonly options: MtnMomoOptions) {}

  async requestPayment(request: CollectionRequest): Promise<void> {
    const headers: Record<string, string> = {
      ...(await this.authHeaders()),
      'Content-Type': 'application/json',
      'X-Reference-Id': request.transactionId,
    };
    if (request.callbackUrl) {
      headers['X-Callback-Url'] = request.callbackUrl;
    }

    const { status, json } = await callProvider(
      this.provider,
      `${this.options.baseUrl}/collection/v1_0/requesttopay`,
      {
        method: 'POST',
        headers,
        body: {
          amount: String(request.amount),
          currency: request.currency,
          externalId: request.transactionId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: toInternationalMsisdn(request.phone),
          },
          payerMessage: request.description,
          payeeNote: request.description,
        },
      },
      this.options.timeoutMs,
    );

    if (status !== 202) {
      throw new ProviderRejectedError(
        this.provider,
        `HTTP ${status} ${json?.code ?? ''} ${json?.message ?? ''}`.trim(),
      );
    }
  }

  async getStatus(transactionId: string): Promise<ProviderStatusReport | null> {
    const { status, json } = await callProvider(
      this.provider,
      `${this.options.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(transactionId)}`,
      { method: 'GET', headers: await this.authHeaders() },
      this.options.timeoutMs,
    );
    if (status === 404) {
      return null;
    }
    if (status !== 200) {
      throw new ProviderRejectedError(this.provider, `HTTP ${status}`);
    }

    const statuses: Record<string, PaymentStatus> = {
      SUCCESSFUL: PaymentStatus.Success,
      FAILED: PaymentStatus.Failed,
      REJECTED: PaymentStatus.Failed,
      TIMEOUT: PaymentStatus.Failed,
      PENDING: PaymentStatus.Pending,
    };

    return {
      status: statuses[json?.status] ?? PaymentStatus.Pending,
      amount: json?.amount === undefined ? undefined : Number(json.amount),
      currency: json?.currency,
      reason: json?.reason?.message ?? json?.reason,
    };
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.token.get(async () => {
      const basic = Buffer.from(
        `${this.options.apiUser}:${this.options.apiKey}`,
      ).toString('base64');
      const { status, json } = await callProvider(
        this.provider,
        `${this.options.baseUrl}/collection/token/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Ocp-Apim-Subscription-Key': this.options.subscriptionKey,
          },
        },
        this.options.timeoutMs,
      );
      if (status !== 200 || !json?.access_token) {
        throw new ProviderRejectedError(
          this.provider,
          `token request failed with HTTP ${status}`,
        );
      }

      return { token: json.access_token, expiresInSeconds: json.expires_in };
    });

    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Target-Environment': this.options.targetEnvironment,
      'Ocp-Apim-Subscription-Key': this.options.subscriptionKey,
    };
  }
}
