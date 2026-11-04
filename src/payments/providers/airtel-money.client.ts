import { PaymentProvider, PaymentStatus } from '../payment.enums.js';
import {
  CollectionRequest,
  PaymentProviderClient,
  ProviderRejectedError,
  ProviderStatusReport,
} from './payment-provider.js';
import { callProvider, TokenCache } from './provider-http.js';

export interface AirtelMoneyOptions {
  /** https://openapiuat.airtel.africa (UAT) or https://openapi.airtel.africa (production). */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
}

/**
 * Airtel Money Collection API (USSD push).
 *
 *   POST {base}/auth/oauth2/token                      client_credentials -> access_token
 *   POST {base}/merchant/v1/payments/                  { transaction: { id: <our transactionId> } }
 *        X-Country: RW, X-Currency: RWF
 *   GET  {base}/standard/v1/payments/{id}              data.transaction.status: TS | TF | TA | TIP
 *
 * Airtel's callback URL is configured once in its developer portal, not per request.
 */
export class AirtelMoneyClient implements PaymentProviderClient {
  readonly provider = PaymentProvider.Airtel;
  private readonly token = new TokenCache();

  constructor(private readonly options: AirtelMoneyOptions) {}

  async requestPayment(request: CollectionRequest): Promise<void> {
    const { status, json } = await callProvider(
      this.provider,
      `${this.options.baseUrl}/merchant/v1/payments/`,
      {
        method: 'POST',
        headers: {
          ...(await this.authHeaders()),
          'Content-Type': 'application/json',
        },
        body: {
          reference: request.description,
          subscriber: {
            country: 'RW',
            currency: request.currency,
            // Airtel wants the number without the country code or leading 0.
            msisdn: request.phone.replace(/^0/, ''),
          },
          transaction: {
            amount: request.amount,
            country: 'RW',
            currency: request.currency,
            id: request.transactionId,
          },
        },
      },
      this.options.timeoutMs,
    );

    if (status < 200 || status >= 300 || json?.status?.success === false) {
      throw new ProviderRejectedError(
        this.provider,
        `HTTP ${status} ${json?.status?.response_code ?? ''} ${json?.status?.message ?? ''}`.trim(),
      );
    }
  }

  async getStatus(transactionId: string): Promise<ProviderStatusReport | null> {
    const { status, json } = await callProvider(
      this.provider,
      `${this.options.baseUrl}/standard/v1/payments/${encodeURIComponent(transactionId)}`,
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
      TS: PaymentStatus.Success,
      TF: PaymentStatus.Failed,
      TE: PaymentStatus.Failed,
      TA: PaymentStatus.Pending,
      TIP: PaymentStatus.Pending,
    };
    const transaction = json?.data?.transaction;

    return {
      status: statuses[transaction?.status] ?? PaymentStatus.Pending,
      reason: transaction?.message,
    };
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.token.get(async () => {
      const { status, json } = await callProvider(
        this.provider,
        `${this.options.baseUrl}/auth/oauth2/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            client_id: this.options.clientId,
            client_secret: this.options.clientSecret,
            grant_type: 'client_credentials',
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

      return {
        token: json.access_token,
        expiresInSeconds: Number(json.expires_in),
      };
    });

    return {
      Authorization: `Bearer ${accessToken}`,
      'X-Country': 'RW',
      'X-Currency': 'RWF',
    };
  }
}
