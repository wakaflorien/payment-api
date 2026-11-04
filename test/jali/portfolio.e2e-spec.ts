import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { Role } from '../../src/users/role.enum.js';
import {
  Client,
  createCustomer,
  createLoan,
  createTestApp,
  loginAs,
  resetDatabase,
} from './helpers.js';

describe('Step 5 (bonus): portfolio report', () => {
  let app: INestApplication<App>;
  let api: Client;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    // The report is admin/auditor only; an admin can also create the loans it summarises.
    api = (await loginAs(app, Role.Admin)).api;
  });

  afterAll(async () => {
    await app.close();
  });

  it('summarises the loan portfolio', async () => {
    // Loan totals: 110,000 and 55,000. Pay 10,000 on the first and clear the second.
    const first = await createLoan(api, await createCustomer(api), {
      principal: 100_000,
      termMonths: 2,
    });
    const second = await createLoan(api, await createCustomer(api), {
      principal: 50_000,
      termMonths: 2,
    });
    await api
      .post(`/api/loans/${first}/repayments`, {
        amount: 10_000,
        providerRef: 'R1',
      })
      .expect(201);
    await api
      .post(`/api/loans/${second}/repayments`, {
        amount: 55_000,
        providerRef: 'R2',
      })
      .expect(201);

    const response = await api.get('/api/reports/portfolio').expect(200);

    expect(response.body).toEqual({
      activeLoans: 1,
      totalOutstanding: 100_000,
      totalRepaid: 65_000,
    });
  });

  it('returns numbers, not strings, and zeros for an empty portfolio', async () => {
    const response = await api.get('/api/reports/portfolio').expect(200);

    expect(response.body).toEqual({
      activeLoans: 0,
      totalOutstanding: 0,
      totalRepaid: 0,
    });
  });
});
