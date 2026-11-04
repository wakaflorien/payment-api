import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { EntityManager } from 'typeorm';
import { Payment } from '../../src/payments/entities/payment.entity.js';
import { PaymentStatus } from '../../src/payments/payment.enums.js';
import { ProviderUnavailableError } from '../../src/payments/providers/payment-provider.js';
import { PaymentProviderRegistry } from '../../src/payments/providers/payment-provider.registry.js';
import { signCallback } from '../../src/payments/signature.js';
import {
  Client,
  client,
  createCustomer,
  createLoan,
  createTestApp,
  expectValidationError,
  loginAsOfficer,
  resetDatabase,
} from './helpers.js';
import {
  callbackBody,
  db,
  requestPayment,
  sendCallback,
} from './payment-helpers.js';

describe('Payments: provider callbacks', () => {
  let app: INestApplication<App>;
  let api: Client;
  let loanId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    api = client(app, await loginAsOfficer(app));
    // totalDue = 50,000 + 10% = 55,000
    loanId = await createLoan(api, await createCustomer(api), {
      principal: 50_000,
      termMonths: 2,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Part A: authenticating the provider', () => {
    let transactionId: string;
    let body: ReturnType<typeof callbackBody>;

    beforeEach(async () => {
      ({ transactionId } = await requestPayment(api, loanId, 20_000));
      body = callbackBody({ transaction_id: transactionId });
    });

    const expectUntouched = async () => {
      const response = await api.get(`/api/loans/${loanId}`).expect(200);
      expect(response.body.outstanding).toBe(55_000);
      expect(await db(app).callbacks()).toEqual([]);
    };

    it('accepts a callback with the right token and signature', async () => {
      await sendCallback(app, body).expect(200);
    });

    it.each([
      ['a wrong token', { token: 'not-the-token' }],
      [
        'a signature made with another secret',
        { secret: 'some-other-secret-that-is-long-enough-to-use' },
      ],
      ['a malformed signature', { signature: 'sha256=deadbeef' }],
      [
        'a timestamp 10 minutes old (replay)',
        { timestamp: String(Math.floor(Date.now() / 1000) - 600) },
      ],
      [
        'a timestamp 10 minutes ahead',
        { timestamp: String(Math.floor(Date.now() / 1000) + 600) },
      ],
      ['a non-numeric timestamp', { timestamp: 'yesterday' }],
    ])('rejects %s with 401 and changes nothing', async (_name, options) => {
      const response = await sendCallback(app, body, options).expect(401);

      expect(response.body.message).toBe('Invalid callback credentials.');
      await expectUntouched();
    });

    it('rejects a body changed after signing (amount tampered)', async () => {
      await sendCallback(app, body, {
        rawBody: JSON.stringify({ ...body, amount: '55000' }),
      }).expect(401);
      await expectUntouched();
    });

    it('rejects AIRTEL claims signed with MTN credentials', async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const raw = JSON.stringify({ ...body, provider: 'AIRTEL' });

      await sendCallback(
        app,
        { ...body, provider: 'AIRTEL' },
        {
          token: process.env.MTN_CALLBACK_TOKEN,
          timestamp,
          signature: signCallback(
            process.env.MTN_CALLBACK_SECRET!,
            timestamp,
            raw,
          ),
        },
      ).expect(401);
    });

    it('rejects an unknown provider and requests without any credentials', async () => {
      await sendCallback(app, { ...body, provider: 'MPESA' }).expect(401);
      await request(app.getHttpServer())
        .post('/api/payments/callbacks')
        .send(body)
        .expect(401);
    });

    it('does not accept a staff JWT instead of provider credentials', async () => {
      await api.post('/api/payments/callbacks', body).expect(401);
    });
  });

  describe('Part A: validating the callback', () => {
    let transactionId: string;

    beforeEach(async () => {
      ({ transactionId } = await requestPayment(api, loanId, 20_000));
    });

    it('accepts the amount as a string of digits (as in the brief) or as an integer', async () => {
      const response = await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, amount: 20_000 }),
      ).expect(200);

      expect(response.body.paymentStatus).toBe('SUCCESS');
    });

    it.each([
      ['amount', { amount: '100.50' }],
      ['amount', { amount: '-5' }],
      ['amount', { amount: 'abc' }],
      ['amount', { amount: '0' }],
      ['amount', { amount: '99999999999' }],
      ['currency', { currency: 'USD' }],
      ['status', { status: 'DONE' }],
      ['timestamp', { timestamp: 'yesterday' }],
      ['timestamp', { timestamp: '2026-10-30' }],
      ['timestamp', { timestamp: '2026-10-30T10:30:00' }],
      ['transaction_id', { transaction_id: 'bad id!' }],
    ])('returns 400 for an invalid %s', async (field, override) => {
      const response = await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, ...override }),
      );

      expectValidationError(response, field);
    });

    it('returns 400 for a missing field and for unknown fields', async () => {
      const { status: _status, ...withoutStatus } = callbackBody({
        transaction_id: transactionId,
      });
      expectValidationError(await sendCallback(app, withoutStatus), 'status');

      const response = await sendCallback(app, {
        ...callbackBody({ transaction_id: transactionId }),
        loan_id: 1,
      }).expect(400);
      expect(response.body.message).toContain(
        'property loan_id should not exist',
      );
    });
  });

  describe('Part B: recording the result', () => {
    it('SUCCESS records the payment and reduces the loan balance in one go', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);

      const response = await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId }),
      ).expect(200);

      expect(response.body).toEqual({
        received: true,
        transactionId,
        paymentStatus: 'SUCCESS',
        duplicate: false,
      });
      const payment = await api.get(`/api/payments/${id}`).expect(200);
      expect(payment.body).toMatchObject({
        status: 'SUCCESS',
        amount: 20_000,
        appliedAmount: 20_000,
        unappliedAmount: 0,
        providerTimestamp: '2026-10-30T10:30:00.000Z',
        completedAt: expect.any(String),
      });
      const loan = await api.get(`/api/loans/${loanId}`).expect(200);
      expect(loan.body.outstanding).toBe(35_000);
      expect(loan.body.payments).toEqual([
        {
          amount: 20_000,
          providerRef: transactionId,
          paidAt: expect.any(String),
        },
      ]);
    });

    it('closes the loan when a payment clears it', async () => {
      const { transactionId } = await requestPayment(api, loanId, 55_000);

      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, amount: '55000' }),
      ).expect(200);

      const loan = await api.get(`/api/loans/${loanId}`).expect(200);
      expect(loan.body).toMatchObject({ outstanding: 0, status: 'closed' });
    });

    it('FAILED records the reason and never touches the loan', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);

      const response = await sendCallback(
        app,
        callbackBody({
          transaction_id: transactionId,
          status: 'FAILED',
          reason: 'Payer has insufficient funds',
        }),
      ).expect(200);

      expect(response.body.paymentStatus).toBe('FAILED');
      expect(await db(app).payment(id)).toMatchObject({
        status: 'FAILED',
        appliedAmount: 0,
        failureReason: 'Payer has insufficient funds',
      });
      expect((await db(app).loan(loanId)).outstanding).toBe(55_000);
    });

    it('PENDING is acknowledged without changing anything', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);

      const response = await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, status: 'PENDING' }),
      ).expect(200);

      expect(response.body.paymentStatus).toBe('PENDING');
      expect((await db(app).payment(id)).status).toBe('PENDING');
      expect((await db(app).loan(loanId)).outstanding).toBe(55_000);
    });

    it('keeps an audit row for every callback, with its outcome', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);
      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId }),
      ).expect(200);

      expect(await db(app).callbacks()).toEqual([
        expect.objectContaining({
          provider: 'MTN',
          transactionId,
          reportedStatus: 'SUCCESS',
          outcome: 'APPLIED',
          httpStatus: 200,
          paymentId: id,
          requestId: expect.any(String),
          payload: expect.objectContaining({
            amount: 20_000,
            status: 'SUCCESS',
          }),
        }),
      ]);
    });

    it('returns 404 for a transaction we never requested, and logs it as UNMATCHED', async () => {
      await sendCallback(
        app,
        callbackBody({ transaction_id: 'MTNN848' }),
      ).expect(404);

      expect(await db(app).callbacks()).toEqual([
        expect.objectContaining({
          outcome: 'UNMATCHED',
          httpStatus: 404,
          paymentId: null,
        }),
      ]);
    });

    it('returns 422 and leaves the payment PENDING when the amount differs from the request', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);

      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, amount: '50000' }),
      ).expect(422);

      expect((await db(app).payment(id)).status).toBe('PENDING');
      expect((await db(app).loan(loanId)).outstanding).toBe(55_000);
    });

    it('returns 409 when a callback contradicts a final status (FAILED after SUCCESS)', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);
      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId }),
      ).expect(200);

      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId, status: 'FAILED' }),
      ).expect(409);

      expect((await db(app).payment(id)).status).toBe('SUCCESS');
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
    });
  });

  describe('Part C: reliability', () => {
    it('C1: the same callback sent three times is applied once', async () => {
      const { transactionId } = await requestPayment(api, loanId, 20_000);
      const body = callbackBody({ transaction_id: transactionId });

      const first = await sendCallback(app, body).expect(200);
      const second = await sendCallback(app, body).expect(200);
      const third = await sendCallback(app, body).expect(200);

      expect([first, second, third].map((r) => r.body.duplicate)).toEqual([
        false,
        true,
        true,
      ]);
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
      expect((await db(app).callbacks()).map((c) => c.outcome)).toEqual([
        'APPLIED',
        'DUPLICATE',
        'DUPLICATE',
      ]);
    });

    it('C1: three copies arriving at the same moment are still applied once', async () => {
      const { transactionId } = await requestPayment(api, loanId, 20_000);
      const body = callbackBody({ transaction_id: transactionId });

      const responses = await Promise.all([
        sendCallback(app, body),
        sendCallback(app, body),
        sendCallback(app, body),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(responses.filter((r) => r.body.duplicate === false)).toHaveLength(
        1,
      );
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
    });

    it('C2: if the database fails mid-update, nothing is committed and the retry succeeds', async () => {
      const { id, transactionId } = await requestPayment(api, loanId, 20_000);
      const body = callbackBody({ transaction_id: transactionId });

      // Fail the payment write *after* the loan balance was already updated in the
      // same transaction, to prove the loan update is rolled back with it.
      // Intentionally unbound: the spy below re-invokes it with the right `this`.
      // oxlint-disable-next-line typescript/unbound-method
      const save = EntityManager.prototype.save;
      const spy = vi
        .spyOn(EntityManager.prototype, 'save')
        .mockImplementation(function (this: EntityManager, ...args: unknown[]) {
          const [entity] = args;
          if (
            entity instanceof Payment &&
            entity.status === PaymentStatus.Success
          ) {
            spy.mockRestore();
            return Promise.reject(new Error('Simulated: connection lost'));
          }
          return (save as (...a: unknown[]) => Promise<unknown>).apply(
            this,
            args,
          );
        } as never);

      const failed = await sendCallback(app, body).expect(500);

      expect(failed.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect((await db(app).loan(loanId)).outstanding).toBe(55_000);
      expect((await db(app).payment(id)).status).toBe('PENDING');

      // The provider retries because it got a 5xx.
      const retried = await sendCallback(app, body).expect(200);

      expect(retried.body).toMatchObject({
        paymentStatus: 'SUCCESS',
        duplicate: false,
      });
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
      expect(
        (await db(app).callbacks()).map((c) => [c.outcome, c.httpStatus]),
      ).toEqual([
        ['ERROR', 500],
        ['APPLIED', 200],
      ]);
    });

    it('C3: two payments for the same loan arriving together both apply, one after the other', async () => {
      const first = await requestPayment(api, loanId, 30_000);
      const second = await requestPayment(api, loanId, 25_000, 'AIRTEL');

      await Promise.all([
        sendCallback(
          app,
          callbackBody({
            transaction_id: first.transactionId,
            amount: '30000',
          }),
        ).expect(200),
        sendCallback(
          app,
          callbackBody({
            provider: 'AIRTEL',
            transaction_id: second.transactionId,
            amount: '25000',
          }),
        ).expect(200),
      ]);

      expect(await db(app).loan(loanId)).toMatchObject({
        outstanding: 0,
        status: 'closed',
      });
    });

    it('C3: ten simultaneous payments leave exactly the right balance', async () => {
      const payments = [];
      for (let i = 0; i < 10; i++) {
        payments.push(await requestPayment(api, loanId, 5_000));
      }

      const responses = await Promise.all(
        payments.map(({ transactionId }) =>
          sendCallback(
            app,
            callbackBody({ transaction_id: transactionId, amount: '5000' }),
          ),
        ),
      );

      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect((await db(app).loan(loanId)).outstanding).toBe(5_000);
    });

    it('C3: when a race overpays the loan, the surplus is kept as unapplied, never lost', async () => {
      const first = await requestPayment(api, loanId, 30_000);
      const second = await requestPayment(api, loanId, 25_000);
      // Meanwhile an officer records 10,000 received in cash: only 45,000 is now owed.
      await api
        .post(`/api/loans/${loanId}/repayments`, {
          amount: 10_000,
          providerRef: 'CASH-1',
        })
        .expect(201);

      await Promise.all([
        sendCallback(
          app,
          callbackBody({
            transaction_id: first.transactionId,
            amount: '30000',
          }),
        ).expect(200),
        sendCallback(
          app,
          callbackBody({
            transaction_id: second.transactionId,
            amount: '25000',
          }),
        ).expect(200),
      ]);

      const settled = [
        await db(app).payment(first.id),
        await db(app).payment(second.id),
      ];
      expect(settled.every((p) => p.status === 'SUCCESS')).toBe(true);
      expect(settled.reduce((sum, p) => sum + p.appliedAmount, 0)).toBe(45_000);
      expect(settled.reduce((sum, p) => sum + p.unappliedAmount, 0)).toBe(
        10_000,
      );
      expect(await db(app).loan(loanId)).toMatchObject({
        outstanding: 0,
        status: 'closed',
      });
    });

    it('C4: a callback arriving after our request timed out is still applied', async () => {
      vi.spyOn(
        app.get(PaymentProviderRegistry).get('MTN' as never),
        'requestPayment',
      ).mockRejectedValueOnce(
        new ProviderUnavailableError('MTN', 'no response within 10000 ms'),
      );

      const request = await api
        .post(`/api/loans/${loanId}/payment-requests`, {
          provider: 'MTN',
          amount: 20_000,
        })
        .expect(202);

      // We don't know whether MTN got it, so the payment is PENDING, not FAILED.
      expect(request.body).toMatchObject({
        status: 'PENDING',
        providerResponse: 'UNKNOWN',
      });

      // Much later, MTN's callback arrives, with the original payment time in the body.
      const late = await sendCallback(
        app,
        callbackBody({
          transaction_id: request.body.transactionId,
          timestamp: '2026-10-30T10:30:00Z',
        }),
      ).expect(200);

      expect(late.body.paymentStatus).toBe('SUCCESS');
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
    });
  });
});
