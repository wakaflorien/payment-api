import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { isDuplicateEntry } from '../../src/common/is-duplicate-entry.js';
import {
  Loan,
  LoanStatus,
  ONE_ACTIVE_LOAN_PER_CUSTOMER,
} from '../../src/loans/entities/loan.entity.js';
import {
  Client,
  client,
  createCustomer,
  createLoan,
  createTestApp,
  expectValidationError,
  login,
  loginAsOfficer,
  resetDatabase,
} from './helpers.js';

describe('Step 3: loans', () => {
  let app: INestApplication<App>;
  let api: Client;
  let customerId: number;

  const loanPayload = (overrides: Record<string, unknown> = {}) => ({
    customerId,
    principal: 100_000,
    interestRate: 10,
    termMonths: 3,
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    // Only Date is faked; real timers keep MySQL and HTTP working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0)); // 4 Nov 2026, local time

    await resetDatabase(app);
    api = client(app, await loginAsOfficer(app));
    customerId = await createCustomer(api);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a loan with flat interest and an installment schedule', async () => {
    const response = await api.post('/api/loans', loanPayload()).expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      customerId,
      principal: 100_000,
      interestRate: 10,
      interestAmount: 10_000,
      totalDue: 110_000,
      outstanding: 110_000,
      termMonths: 3,
      status: 'active',
      disbursedAt: '2026-11-04',
      installments: [
        { number: 1, dueDate: '2026-12-04', amount: 36_667 },
        { number: 2, dueDate: '2027-01-04', amount: 36_667 },
        { number: 3, dueDate: '2027-02-04', amount: 36_666 },
      ],
      payments: [],
    });
  });

  it('rounds interest to whole francs', async () => {
    // 33,333 x 5% = 1,666.65, which rounds to 1,667
    const response = await api
      .post(
        '/api/loans',
        loanPayload({ principal: 33_333, interestRate: 5, termMonths: 1 }),
      )
      .expect(201);

    expect(response.body.interestAmount).toBe(1_667);
    expect(response.body.totalDue).toBe(35_000);
    expect(response.body.installments[0].amount).toBe(35_000);
  });

  it('accepts a fractional rate like 12.5%', async () => {
    const response = await api
      .post('/api/loans', loanPayload({ interestRate: 12.5 }))
      .expect(201);

    expect(response.body.interestRate).toBe(12.5);
    expect(response.body.interestAmount).toBe(12_500);
  });

  it('installments always add up to the total due', async () => {
    const response = await api
      .post(
        '/api/loans',
        loanPayload({
          principal: 1_234_567,
          interestRate: 7.25,
          termMonths: 7,
        }),
      )
      .expect(201);
    const amounts: number[] = response.body.installments.map(
      (i: { amount: number }) => i.amount,
    );

    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(
      response.body.totalDue,
    );
    expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
  });

  it('keeps due dates valid at the end of a month', async () => {
    vi.setSystemTime(new Date(2027, 0, 31, 12, 0, 0)); // 31 Jan 2027
    api = client(app, await login(app)); // the earlier token has expired by now

    const response = await api
      .post('/api/loans', loanPayload({ termMonths: 2 }))
      .expect(201);

    expect(
      response.body.installments.map((i: { dueDate: string }) => i.dueDate),
    ).toEqual(['2027-02-28', '2027-03-31']);
  });

  it.each([
    ['principal too small', { principal: 9_999 }, 'principal'],
    ['principal too large', { principal: 50_000_001 }, 'principal'],
    ['principal not whole', { principal: 10_000.5 }, 'principal'],
    ['negative rate', { interestRate: -1 }, 'interestRate'],
    ['rate over 100', { interestRate: 101 }, 'interestRate'],
    ['term zero', { termMonths: 0 }, 'termMonths'],
    ['term too long', { termMonths: 37 }, 'termMonths'],
  ])('rejects %s with a 400', async (_label, overrides, field) => {
    const response = await api.post('/api/loans', loanPayload(overrides));

    expectValidationError(response, field);
  });

  it('returns 404 for an unknown customer', async () => {
    await api.post('/api/loans', loanPayload({ customerId: 999 })).expect(404);
  });

  it('allows only one active loan per customer (409)', async () => {
    await api.post('/api/loans', loanPayload()).expect(201);

    await api.post('/api/loans', loanPayload()).expect(409);
  });

  it('shows a loan with its installments and payments', async () => {
    const loanId = await createLoan(api, customerId);

    const response = await api.get(`/api/loans/${loanId}`).expect(200);

    expect(response.body.id).toBe(loanId);
    expect(response.body.installments).toHaveLength(3);
    expect(response.body.payments).toEqual([]);
  });

  it('returns 404 for an unknown loan', async () => {
    await api.get('/api/loans/999').expect(404);
  });

  it('returns 400 for a non-numeric loan id', async () => {
    await api.get('/api/loans/abc').expect(400);
  });

  describe('double disbursement (real MySQL locks and indexes)', () => {
    const loansOf = (id: number) =>
      app.get(DataSource).getRepository(Loan).countBy({ customerId: id });

    /** A complete loans row, written straight to the table, bypassing LoansService. */
    const loanRow = (status: LoanStatus) => ({
      customerId,
      principal: 100_000,
      interestRate: 10,
      interestAmount: 10_000,
      totalDue: 110_000,
      outstanding: status === LoanStatus.Active ? 110_000 : 0,
      termMonths: 3,
      status,
      disbursedAt: '2026-11-04',
    });

    it('never disburses twice when two requests arrive at the same moment', async () => {
      const responses = await Promise.all([
        api.post('/api/loans', loanPayload()),
        api.post('/api/loans', loanPayload()),
      ]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await loansOf(customerId)).toBe(1);
    });

    it('disburses exactly one loan out of a burst of five', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => api.post('/api/loans', loanPayload())),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await loansOf(customerId)).toBe(1);
    });

    it('still serves different customers in parallel', async () => {
      const otherCustomerId = await createCustomer(api);

      const responses = await Promise.all([
        api.post('/api/loans', loanPayload()),
        api.post('/api/loans', loanPayload({ customerId: otherCustomerId })),
      ]);

      expect(responses.map((r) => r.status)).toEqual([201, 201]);
    });

    it('the database itself rejects a second active loan, even without the service', async () => {
      const loans = app.get(DataSource).getRepository(Loan);
      await loans.insert(loanRow(LoanStatus.Active));

      const error: unknown = await loans
        .insert(loanRow(LoanStatus.Active))
        .catch((rejection: unknown) => rejection);

      expect(isDuplicateEntry(error, ONE_ACTIVE_LOAN_PER_CUSTOMER)).toBe(true);
      expect(await loansOf(customerId)).toBe(1);
    });

    it('the database guard allows any number of closed loans next to one active loan', async () => {
      const loans = app.get(DataSource).getRepository(Loan);

      await loans.insert(loanRow(LoanStatus.Closed));
      await loans.insert(loanRow(LoanStatus.Closed));
      await loans.insert(loanRow(LoanStatus.Active));

      expect(await loansOf(customerId)).toBe(3);
    });
  });
});
