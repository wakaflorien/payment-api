import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import {
  Client,
  client,
  createTestApp,
  customerPayload,
  expectValidationError,
  loginAsOfficer,
  resetDatabase,
} from './helpers.js';

describe('Step 2: customers', () => {
  let app: INestApplication<App>;
  let api: Client;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    api = client(app, await loginAsOfficer(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a customer', async () => {
    const payload = {
      fullName: 'Aline Uwase',
      phone: '0788123456',
      nationalId: '1199080012345678',
    };

    const response = await api.post('/api/customers', payload).expect(201);

    expect(response.body).toEqual({ id: expect.any(Number), ...payload });
  });

  it.each([
    ['missing name', { fullName: '' }, 'fullName'],
    ['phone too short', { phone: '078812345' }, 'phone'],
    ['phone not a Rwandan mobile', { phone: '0712345678' }, 'phone'],
    ['phone with letters', { phone: '07881234ab' }, 'phone'],
    ['phone as a number', { phone: 788123456 }, 'phone'],
    ['national id too short', { nationalId: '119908001234567' }, 'nationalId'],
    [
      'national id with letters',
      { nationalId: '11990800123456AB' },
      'nationalId',
    ],
  ])('rejects %s with a 400', async (_label, overrides, field) => {
    const response = await api.post(
      '/api/customers',
      customerPayload(overrides),
    );

    expectValidationError(response, field);
  });

  it('accepts all four mobile prefixes: 078, 079, 072 and 073', async () => {
    for (const prefix of ['078', '079', '072', '073']) {
      const { phone } = customerPayload();
      await api
        .post(
          '/api/customers',
          customerPayload({ phone: prefix + phone.slice(3) }),
        )
        .expect(201);
    }
  });

  it('rejects a duplicate phone with a 409', async () => {
    const first = customerPayload();
    await api.post('/api/customers', first).expect(201);

    await api
      .post('/api/customers', customerPayload({ phone: first.phone }))
      .expect(409);
  });

  it('rejects a duplicate national id with a 409', async () => {
    const first = customerPayload();
    await api.post('/api/customers', first).expect(201);

    await api
      .post('/api/customers', customerPayload({ nationalId: first.nationalId }))
      .expect(409);
  });

  it('lists customers newest first, 15 per page', async () => {
    for (let i = 0; i < 17; i++) {
      await api.post('/api/customers', customerPayload()).expect(201);
    }

    const firstPage = await api.get('/api/customers').expect(200);
    expect(firstPage.body.data).toHaveLength(15);
    expect(firstPage.body.meta).toEqual({
      page: 1,
      limit: 15,
      total: 17,
      totalPages: 2,
    });
    expect(firstPage.body.data[0].id).toBeGreaterThan(
      firstPage.body.data[1].id,
    );

    const secondPage = await api.get('/api/customers?page=2').expect(200);
    expect(secondPage.body.data).toHaveLength(2);
    expect(secondPage.body.meta.page).toBe(2);
  });
});
