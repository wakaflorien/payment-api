import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
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

describe('Step 4: repayments', () => {
  let app: INestApplication<App>;
  let api: Client;
  let customerId: number;
  let loanId: number;

  const repay = (amount: number, providerRef: string, id = loanId) =>
    api.post(`/api/loans/${id}/repayments`, { amount, providerRef });

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    api = client(app, await loginAsOfficer(app));
    customerId = await createCustomer(api);
    // totalDue = 50,000 + 10% = 55,000
    loanId = await createLoan(api, customerId, {
      principal: 50_000,
      termMonths: 2,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('records a repayment and reduces the outstanding balance', async () => {
    const response = await repay(20_000, 'MOMO-001').expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      amount: 20_000,
      providerRef: 'MOMO-001',
      loanOutstanding: 35_000,
      loanStatus: 'active',
    });

    const loan = await api.get(`/api/loans/${loanId}`).expect(200);
    expect(loan.body.outstanding).toBe(35_000);
    expect(loan.body.payments).toEqual([
      { amount: 20_000, providerRef: 'MOMO-001', paidAt: expect.any(String) },
    ]);
  });

  it('closes the loan when it is fully repaid', async () => {
    await repay(30_000, 'MOMO-001').expect(201);
    const response = await repay(25_000, 'MOMO-002').expect(201);

    expect(response.body.loanOutstanding).toBe(0);
    expect(response.body.loanStatus).toBe('closed');
  });

  it('ignores a duplicate mobile money reference with a 409 and changes nothing', async () => {
    await repay(20_000, 'MOMO-001').expect(201);

    await repay(20_000, 'MOMO-001').expect(409);

    const loan = await api.get(`/api/loans/${loanId}`);
    expect(loan.body.outstanding).toBe(35_000);
    expect(loan.body.payments).toHaveLength(1);
  });

  it('rejects a payment larger than the outstanding balance with a 422', async () => {
    await repay(55_001, 'MOMO-001').expect(422);

    const loan = await api.get(`/api/loans/${loanId}`);
    expect(loan.body.outstanding).toBe(55_000);
  });

  it('rejects payments on a closed loan with a 422', async () => {
    await repay(55_000, 'MOMO-001').expect(201);

    await repay(1, 'MOMO-002').expect(422);
  });

  it.each([
    ['zero amount', { amount: 0, providerRef: 'R1' }, 'amount'],
    ['fractional amount', { amount: 100.5, providerRef: 'R1' }, 'amount'],
    ['missing ref', { amount: 100 }, 'providerRef'],
    [
      'ref too long',
      { amount: 100, providerRef: 'x'.repeat(101) },
      'providerRef',
    ],
  ])('rejects %s with a 400', async (_label, body, field) => {
    const response = await api.post(`/api/loans/${loanId}/repayments`, body);

    expectValidationError(response, field);
  });

  it('returns 404 when repaying an unknown loan', async () => {
    await repay(100, 'MOMO-001', 999).expect(404);
  });

  it('lets a customer take a new loan after closing the old one', async () => {
    await repay(55_000, 'MOMO-001').expect(201);

    await createLoan(api, customerId);
  });

  describe('concurrency (real MySQL row locks)', () => {
    it('never lets two simultaneous payments overpay a loan', async () => {
      // 30,000 + 30,000 > 55,000, so exactly one of them must win.
      const responses = await Promise.all([
        repay(30_000, 'RACE-A'),
        repay(30_000, 'RACE-B'),
      ]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 422,
      ]);
      const loan = await api.get(`/api/loans/${loanId}`);
      expect(loan.body.outstanding).toBe(25_000);
      expect(loan.body.payments).toHaveLength(1);
    });

    it('stores the same callback only once when it arrives twice at the same moment', async () => {
      const responses = await Promise.all([
        repay(10_000, 'DUP-1'),
        repay(10_000, 'DUP-1'),
      ]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const loan = await api.get(`/api/loans/${loanId}`);
      expect(loan.body.outstanding).toBe(45_000);
    });

    it('stays consistent under a burst of ten payments', async () => {
      // Ten payments of 10,000 against 55,000: five succeed, five are rejected.
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) => repay(10_000, `BURST-${i}`)),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(5);
      expect(responses.filter((r) => r.status === 422)).toHaveLength(5);
      const loan = await api.get(`/api/loans/${loanId}`);
      expect(loan.body.outstanding).toBe(5_000);
    });
  });
});
