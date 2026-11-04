import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { UsersService } from '../../src/users/users.service.js';
import { client, createTestApp, OFFICER, resetDatabase } from './helpers.js';

describe('Step 1: auth', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await app.get(UsersService).create(OFFICER.email, OFFICER.password);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (body: object) =>
    request(app.getHttpServer()).post('/api/auth/login').send(body);

  it('returns an access token for valid credentials', async () => {
    const response = await login(OFFICER).expect(200);

    expect(response.body).toEqual({ accessToken: expect.any(String) });
  });

  it('rejects a wrong password with a 401', async () => {
    await login({ ...OFFICER, password: 'wrong' }).expect(401);
  });

  it('rejects an unknown email with a 401', async () => {
    await login({ ...OFFICER, email: 'nobody@jali.rw' }).expect(401);
  });

  it('validates the login body', async () => {
    await login({ email: 'not-an-email' }).expect(400);
  });

  it('never stores the plain password', async () => {
    const user = await app.get(UsersService).findByEmail(OFFICER.email);

    expect(user?.passwordHash).toBeDefined();
    expect(user?.passwordHash).not.toBe(OFFICER.password);
  });

  it('lets the token call protected endpoints', async () => {
    const { body } = await login(OFFICER);

    await client(app, body.accessToken).get('/api/customers').expect(200);
  });

  it('rejects a forged token', async () => {
    await client(app, 'not.a.real-token').get('/api/customers').expect(401);
  });

  it.each([
    ['GET', '/api/customers'],
    ['POST', '/api/customers'],
    ['POST', '/api/loans'],
    ['GET', '/api/loans/1'],
    ['POST', '/api/loans/1/repayments'],
    ['GET', '/api/reports/portfolio'],
  ])('blocks %s %s without a token', async (method, url) => {
    const server = request(app.getHttpServer());
    const call = method === 'GET' ? server.get(url) : server.post(url).send({});

    await call.expect(401);
  });
});
