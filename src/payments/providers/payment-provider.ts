import { MobileMoneyProvider, PaymentStatus } from '../payment.enums.js';

/** A "collection" (request-to-pay): the customer gets a prompt on their phone to approve. */
export interface CollectionRequest {
  /** Our id. The provider uses it as its idempotency key and echoes it in callbacks. */
  transactionId: string;
  amount: number;
  currency: string;
  /** Local format, e.g. 0788123456. Each adapter converts it to the provider's format. */
  phone: string;
  /** Where the provider should POST the result (MTN takes it per request). */
  callbackUrl?: string;
  description: string;
}

/** The provider's view of one transaction, from a status query. */
export interface ProviderStatusReport {
  status: PaymentStatus;
  /** Not every provider returns these; callers fall back to what we requested. */
  amount?: number;
  currency?: string;
  reason?: string;
}

/**
 * One adapter per provider. Callers only depend on this interface, so adding a
 * provider (or swapping in the simulator for local runs) touches nothing else.
 */
export interface PaymentProviderClient {
  readonly provider: MobileMoneyProvider;

  /**
   * Resolves when the provider accepted the request. The payment is still PENDING:
   * only a callback or a status query tells us how it ended.
   * @throws ProviderRejectedError    the provider definitely refused it (4xx)
   * @throws ProviderUnavailableError timeout, network error or 5xx: outcome unknown
   */
  requestPayment(request: CollectionRequest): Promise<void>;

  /**
   * @returns null when the provider has no record of this transaction.
   * @throws ProviderUnavailableError when the provider can't be reached.
   */
  getStatus(transactionId: string): Promise<ProviderStatusReport | null>;
}

/** The provider answered and said no. Safe to mark the payment FAILED. */
export class ProviderRejectedError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
  ) {
    super(`${provider} rejected the request: ${reason}`);
    this.name = 'ProviderRejectedError';
  }
}

/**
 * We don't know what happened (timeout, network failure, 5xx). The provider may well
 * have accepted the request, so the payment must stay PENDING, never FAILED.
 */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
  ) {
    super(`${provider} is unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

/** 0788123456 -> 250788123456 (MSISDN with country code, as MTN expects). */
export function toInternationalMsisdn(phone: string): string {
  return `250${phone.replace(/^0/, '')}`;
}
