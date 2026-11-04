/** Who moved the money. MANUAL = recorded by a loan officer through POST /loans/:id/repayments. */
export enum PaymentProvider {
  Mtn = 'MTN',
  Airtel = 'AIRTEL',
  Manual = 'MANUAL',
}

/** The mobile money providers that send signed callbacks and accept payment requests. */
export const MOBILE_MONEY_PROVIDERS = [
  PaymentProvider.Mtn,
  PaymentProvider.Airtel,
] as const;

export type MobileMoneyProvider = (typeof MOBILE_MONEY_PROVIDERS)[number];

/**
 * PENDING  -> we asked the provider, or the provider said "in progress". Outcome unknown.
 * SUCCESS  -> final. Money was collected and applied to the loan in the same transaction.
 * FAILED   -> final. No money moved, the loan was never touched.
 *
 * The only allowed transitions are PENDING -> SUCCESS and PENDING -> FAILED.
 */
export enum PaymentStatus {
  Pending = 'PENDING',
  Success = 'SUCCESS',
  Failed = 'FAILED',
}

/** What happened to one provider callback. Stored in payment_callbacks for audits. */
export enum CallbackOutcome {
  /** The payment moved to SUCCESS or FAILED. */
  Applied = 'APPLIED',
  /** The payment was already in that final status. Nothing changed. */
  Duplicate = 'DUPLICATE',
  /** The provider reported PENDING. Nothing changed. */
  NoChange = 'NO_CHANGE',
  /** No payment request with this transaction id exists. */
  Unmatched = 'UNMATCHED',
  /** The callback contradicts a final status, e.g. FAILED after SUCCESS. */
  Conflict = 'CONFLICT',
  /** Amount or currency differs from what we requested. Left PENDING for review. */
  Rejected = 'REJECTED',
  /** Unexpected error (e.g. the database). Rolled back; the provider will retry. */
  Error = 'ERROR',
}

/** Largest value of a MySQL INT UNSIGNED column. */
export const MAX_AMOUNT = 4_294_967_295;

export const CURRENCY = 'RWF';
