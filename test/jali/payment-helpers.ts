import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { Loan } from '../../src/loans/entities/loan.entity.js';
import { PaymentCallback } from '../../src/payments/entities/payment-callback.entity.js';
import { Payment } from '../../src/payments/entities/payment.entity.js';
import { signCallback } from '../../src/payments/signature.js';
import { Client } from './helpers.js';

export interface CallbackBody {
  provider: string;
  transaction_id: string;
  amount: string | number;
  currency: string;
  status: string;
  timestamp: string;
  reason?: string;
}

/** The brief's example callback, pointed at one of our transactions. */
export function callbackBody(
  overrides: Partial<CallbackBody> & Pick<CallbackBody, 'transaction_id'>,
): CallbackBody {
  return {
    provider: 'MTN',
    amount: '20000',
    currency: 'RWF',
    status: 'SUCCESS',
    timestamp: '2026-10-30T10:30:00Z',
    ...overrides,
  };
}

function credentialsFor(provider: string) {
  const prefix = provider === 'AIRTEL' ? 'AIRTEL' : 'MTN';

  return {
    token: process.env[`${prefix}_CALLBACK_TOKEN`]!,
    secret: process.env[`${prefix}_CALLBACK_SECRET`]!,
  };
}

export interface SendCallbackOptions {
  token?: string;
  secret?: string;
  /** Unix seconds. Defaults to now. */
  timestamp?: string;
  signature?: string;
  /** Send these bytes instead of JSON.stringify(body), e.g. to tamper after signing. */
  rawBody?: string;
}

/**
 * Sends a callback exactly as a provider does: serialize once, sign those bytes,
 * send those same bytes with the token, timestamp and signature headers.
 */
export function sendCallback(
  app: INestApplication<App>,
  body: object,
  options: SendCallbackOptions = {},
) {
  const credentials = credentialsFor(
    String((body as { provider?: unknown }).provider),
  );
  const signedBody = JSON.stringify(body);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature =
    options.signature ??
    signCallback(options.secret ?? credentials.secret, timestamp, signedBody);

  return request(app.getHttpServer())
    .post('/api/payments/callbacks')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${options.token ?? credentials.token}`)
    .set('X-Timestamp', timestamp)
    .set('X-Signature', signature)
    .send(options.rawBody ?? signedBody);
}

/** Asks the provider to collect `amount` for the loan; returns the PENDING payment. */
export async function requestPayment(
  api: Client,
  loanId: number,
  amount: number,
  provider = 'MTN',
): Promise<{ id: number; transactionId: string }> {
  const response = await api
    .post(`/api/loans/${loanId}/payment-requests`, { provider, amount })
    .expect(202);

  return response.body;
}

export function db(app: INestApplication<App>) {
  const dataSource = app.get(DataSource);

  return {
    loan: (id: number) =>
      dataSource.getRepository(Loan).findOneByOrFail({ id }),
    payment: (id: number) =>
      dataSource.getRepository(Payment).findOneByOrFail({ id }),
    callbacks: () =>
      dataSource.getRepository(PaymentCallback).find({ order: { id: 'ASC' } }),
  };
}
