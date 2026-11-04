import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { Payment } from '../../src/payments/entities/payment.entity.js';
import { PaymentStatus } from '../../src/payments/payment.enums.js';
import { PaymentReconciliationService } from '../../src/payments/payment-reconciliation.service.js';
import {
  PaymentProviderClient,
  ProviderRejectedError,
  ProviderUnavailableError,
} from '../../src/payments/providers/payment-provider.js';
import { PaymentProviderRegistry } from '../../src/payments/providers/payment-provider.registry.js';
import { Role } from '../../src/users/role.enum.js';
import {
  Client,
  createCustomer,
  createLoan,
  createTestApp,
  expectValidationError,
  loginAs,
  resetDatabase,
} from './helpers.js';
import {
  callbackBody,
  db,
  requestPayment,
  sendCallback,
} from './payment-helpers.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MINUTE = 60_000;

describe('Payments: requests, reconciliation and the read API', () => {
  let app: INestApplication<App>;
  let admin: Client;
  let officer: Client;
  let auditor: Client;
  let loanId: number;
  let mtn: PaymentProviderClient;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = (await loginAs(app, Role.Admin)).api;
    officer = (await loginAs(app, Role.LoanOfficer)).api;
    auditor = (await loginAs(app, Role.Auditor)).api;
    // totalDue = 55,000. The customer's phone is 078xxxxxxx.
    loanId = await createLoan(
      officer,
      await createCustomer(officer, { phone: '0788000111' }),
      {
        principal: 50_000,
        termMonths: 2,
      },
    );
    mtn = app.get(PaymentProviderRegistry).get('MTN' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const paymentRequest = (body: object, id = loanId, api = officer) =>
    api.post(`/api/loans/${id}/payment-requests`, body);

  describe('Part D: payment request to the provider', () => {
    it('stores a PENDING payment first, then asks the provider to collect', async () => {
      const spy = vi.spyOn(mtn, 'requestPayment');

      const response = await paymentRequest({
        provider: 'MTN',
        amount: 20_000,
      }).expect(202);

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        loanId,
        provider: 'MTN',
        transactionId: expect.stringMatching(UUID),
        amount: 20_000,
        appliedAmount: 0,
        currency: 'RWF',
        status: 'PENDING',
        payerPhone: '0788000111',
        providerResponse: 'ACCEPTED',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: response.body.transactionId,
          amount: 20_000,
          currency: 'RWF',
          phone: '0788000111',
        }),
      );
    });

    it('does not touch the loan balance until the provider confirms', async () => {
      const { id } = await requestPayment(officer, loanId, 20_000);

      const loan = await officer.get(`/api/loans/${loanId}`).expect(200);
      expect(loan.body.outstanding).toBe(55_000);
      expect(loan.body.payments).toEqual([]);

      const all = await officer
        .get(`/api/loans/${loanId}/payments`)
        .expect(200);
      expect(all.body).toEqual([
        expect.objectContaining({ id, status: 'PENDING' }),
      ]);
    });

    it('uses another phone number when given one', async () => {
      const response = await paymentRequest({
        provider: 'AIRTEL',
        amount: 5_000,
        phone: '0732000222',
      }).expect(202);

      expect(response.body.payerPhone).toBe('0732000222');
    });

    it('marks the payment FAILED and returns 502 when the provider refuses', async () => {
      vi.spyOn(mtn, 'requestPayment').mockRejectedValueOnce(
        new ProviderRejectedError('MTN', 'HTTP 400 PAYER_NOT_FOUND'),
      );

      const response = await paymentRequest({
        provider: 'MTN',
        amount: 20_000,
      }).expect(502);

      expect(response.body.message).toContain('PAYER_NOT_FOUND');
      const [payment] = (await officer.get(`/api/loans/${loanId}/payments`))
        .body;
      expect(payment).toMatchObject({
        status: 'FAILED',
        failureReason: 'Rejected by provider: HTTP 400 PAYER_NOT_FOUND',
      });
    });

    it('keeps the payment PENDING when the provider times out', async () => {
      vi.spyOn(mtn, 'requestPayment').mockRejectedValueOnce(
        new ProviderUnavailableError('MTN', 'no response within 10000 ms'),
      );

      const response = await paymentRequest({
        provider: 'MTN',
        amount: 20_000,
      }).expect(202);

      expect(response.body).toMatchObject({
        status: 'PENDING',
        providerResponse: 'UNKNOWN',
      });
    });

    it('refuses to request more than the balance, counting pending requests', async () => {
      await paymentRequest({ provider: 'MTN', amount: 55_001 }).expect(422);
      await requestPayment(officer, loanId, 40_000);

      const response = await paymentRequest({
        provider: 'MTN',
        amount: 20_000,
      }).expect(422);

      expect(response.body.message).toBe(
        'Amount exceeds the outstanding balance of 55000 RWF minus 40000 RWF already requested.',
      );
      await paymentRequest({ provider: 'MTN', amount: 15_000 }).expect(202);
    });

    it('returns 404 for an unknown loan and 422 for a closed one', async () => {
      await paymentRequest({ provider: 'MTN', amount: 1_000 }, 999_999).expect(
        404,
      );

      await officer
        .post(`/api/loans/${loanId}/repayments`, {
          amount: 55_000,
          providerRef: 'CASH-ALL',
        })
        .expect(201);
      await paymentRequest({ provider: 'MTN', amount: 1_000 }).expect(422);
    });

    it.each([
      ['provider', { provider: 'MPESA', amount: 1_000 }],
      ['amount', { provider: 'MTN', amount: 10.5 }],
      ['amount', { provider: 'MTN', amount: 0 }],
      ['phone', { provider: 'MTN', amount: 1_000, phone: '+250788000111' }],
    ])('returns 400 for an invalid %s', async (field, body) => {
      expectValidationError(await paymentRequest(body), field);
    });
  });

  describe('Part C: reconciliation (when callbacks never come)', () => {
    const reconciliation = () => app.get(PaymentReconciliationService);

    it('asks the provider about stuck PENDING payments and applies the answer', async () => {
      const { id, transactionId } = await requestPayment(
        officer,
        loanId,
        20_000,
      );
      const getStatus = vi.spyOn(mtn, 'getStatus').mockResolvedValue({
        status: PaymentStatus.Success,
        amount: 20_000,
        currency: 'RWF',
      });

      // Not due yet: the first check is 2 minutes after the request.
      expect(await reconciliation().runOnce()).toBe(0);

      expect(
        await reconciliation().runOnce(new Date(Date.now() + 3 * MINUTE)),
      ).toBe(1);

      expect(getStatus).toHaveBeenCalledWith(transactionId);
      expect(await db(app).payment(id)).toMatchObject({
        status: 'SUCCESS',
        appliedAmount: 20_000,
      });
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
    });

    it('backs off while the provider still says PENDING', async () => {
      const { id } = await requestPayment(officer, loanId, 20_000);
      vi.spyOn(mtn, 'getStatus').mockResolvedValue({
        status: PaymentStatus.Pending,
      });
      const now = new Date(Date.now() + 3 * MINUTE);

      expect(await reconciliation().runOnce(now)).toBe(1);
      expect(await reconciliation().runOnce(now)).toBe(0);

      const payment = await db(app).payment(id);
      expect(payment).toMatchObject({
        status: 'PENDING',
        reconcileAttempts: 1,
      });
      expect(payment.nextReconcileAt!.getTime()).toBeGreaterThan(now.getTime());
    });

    it('keeps the payment PENDING when the provider is unreachable', async () => {
      const { id } = await requestPayment(officer, loanId, 20_000);
      vi.spyOn(mtn, 'getStatus').mockRejectedValue(
        new ProviderUnavailableError('MTN', 'HTTP 503'),
      );

      await reconciliation().runOnce(new Date(Date.now() + 3 * MINUTE));

      expect((await db(app).payment(id)).status).toBe('PENDING');
    });

    it('expires a payment the provider has never heard of after 24 hours', async () => {
      const { id } = await requestPayment(officer, loanId, 20_000);
      vi.spyOn(mtn, 'getStatus').mockResolvedValue(null);

      await reconciliation().runOnce(new Date(Date.now() + 3 * MINUTE));
      expect((await db(app).payment(id)).status).toBe('PENDING');

      await reconciliation().runOnce(new Date(Date.now() + 25 * 60 * MINUTE));
      expect(await db(app).payment(id)).toMatchObject({
        status: 'FAILED',
        failureReason:
          'Expired: the provider has no record of this transaction.',
      });
      expect((await db(app).loan(loanId)).outstanding).toBe(55_000);
    });

    it('treats a callback arriving after reconciliation settled it as a duplicate', async () => {
      const { transactionId } = await requestPayment(officer, loanId, 20_000);
      vi.spyOn(mtn, 'getStatus').mockResolvedValue({
        status: PaymentStatus.Success,
      });
      await reconciliation().runOnce(new Date(Date.now() + 3 * MINUTE));

      const response = await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId }),
      ).expect(200);

      expect(response.body.duplicate).toBe(true);
      expect((await db(app).loan(loanId)).outstanding).toBe(35_000);
    });

    it('lets an admin trigger a check for one payment', async () => {
      const { id } = await requestPayment(officer, loanId, 20_000);
      vi.spyOn(mtn, 'getStatus').mockResolvedValue({
        status: PaymentStatus.Failed,
        reason: 'APPROVAL_REJECTED',
      });

      await officer.post(`/api/payments/${id}/reconcile`).expect(403);
      const response = await admin
        .post(`/api/payments/${id}/reconcile`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'FAILED',
        failureReason: 'APPROVAL_REJECTED',
      });
    });
  });

  describe('Part D: read API for the front end', () => {
    it('lists payments newest first with filters and pagination', async () => {
      const first = await requestPayment(officer, loanId, 1_000);
      const second = await requestPayment(officer, loanId, 2_000, 'AIRTEL');
      await sendCallback(
        app,
        callbackBody({ transaction_id: first.transactionId, amount: '1000' }),
      ).expect(200);

      const all = await auditor.get('/api/payments').expect(200);
      expect(all.body.meta).toEqual({
        page: 1,
        limit: 15,
        total: 2,
        totalPages: 1,
      });
      expect(all.body.data.map((p: { id: number }) => p.id)).toEqual([
        second.id,
        first.id,
      ]);

      const successes = await auditor
        .get('/api/payments?status=SUCCESS')
        .expect(200);
      expect(successes.body.data).toEqual([
        expect.objectContaining({ id: first.id, status: 'SUCCESS' }),
      ]);

      const airtel = await auditor
        .get(`/api/payments?provider=AIRTEL&loanId=${loanId}`)
        .expect(200);
      expect(airtel.body.data.map((p: { id: number }) => p.id)).toEqual([
        second.id,
      ]);

      expect(
        (await auditor.get('/api/payments?page=2').expect(200)).body.data,
      ).toEqual([]);
    });

    it('validates the filters', async () => {
      expectValidationError(
        await auditor.get('/api/payments?status=DONE'),
        'status',
      );
      expectValidationError(await auditor.get('/api/payments?page=0'), 'page');
      expectValidationError(
        await auditor.get('/api/payments?loanId=abc'),
        'loanId',
      );
    });

    it('shows one payment, or 404', async () => {
      const { id } = await requestPayment(officer, loanId, 1_000);

      await auditor.get(`/api/payments/${id}`).expect(200);
      await auditor.get('/api/payments/999999').expect(404);
      await auditor.get(`/api/loans/999999/payments`).expect(404);
    });

    it('lets auditors read but not request payments', async () => {
      await paymentRequest(
        { provider: 'MTN', amount: 1_000 },
        loanId,
        auditor,
      ).expect(403);
      await auditor.get(`/api/loans/${loanId}/payments`).expect(200);
    });

    it('counts only applied money as repaid in the portfolio report', async () => {
      const { transactionId } = await requestPayment(officer, loanId, 20_000);
      await requestPayment(officer, loanId, 5_000); // still PENDING
      await sendCallback(
        app,
        callbackBody({ transaction_id: transactionId }),
      ).expect(200);

      const report = await admin.get('/api/reports/portfolio').expect(200);

      expect(report.body).toEqual({
        activeLoans: 1,
        totalOutstanding: 35_000,
        totalRepaid: 20_000,
      });
    });
  });

  describe('Part B: database guarantees', () => {
    it('refuses a second row for the same provider transaction at the database level', async () => {
      const { transactionId } = await requestPayment(officer, loanId, 1_000);
      const payments = app.get(DataSource).getRepository(Payment);

      await expect(
        payments.insert({
          loanId,
          provider: 'MTN' as never,
          transactionId,
          amount: 1_000,
          currency: 'RWF',
          status: PaymentStatus.Pending,
        }),
      ).rejects.toMatchObject({ driverError: { code: 'ER_DUP_ENTRY' } });
    });
  });
});
