import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Role } from '../../src/users/role.enum.js';
import { UsersService } from '../../src/users/users.service.js';

export const OFFICER = { email: 'officer@jali.rw', password: 'secret-pass' };

/** Boots the real AppModule with the same global config as main.ts. */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
    // Same as main.ts: provider callbacks are signed over the raw body.
    rawBody: true,
  });
  configureApp(app);
  // Listening on a random port lets supertest reuse one server for concurrent requests.
  await app.listen(0);

  return app;
}

/** Empties every table the app knows about. Uses one connection so FOREIGN_KEY_CHECKS sticks. */
export async function resetDatabase(app: INestApplication<App>): Promise<void> {
  const dataSource = app.get(DataSource);
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { tableName } of dataSource.entityMetadatas) {
      await runner.query(`TRUNCATE TABLE \`${tableName}\``);
    }
    await runner.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await runner.release();
  }
}

/** Creates the loan officer and logs in through the real endpoint. */
export async function loginAsOfficer(
  app: INestApplication<App>,
): Promise<string> {
  await app.get(UsersService).create(OFFICER.email, OFFICER.password);

  return login(app);
}

/** Logs the existing officer in again, e.g. after moving the clock forward. */
export async function login(
  app: INestApplication<App>,
  credentials: { email: string; password: string } = OFFICER,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send(credentials);

  return response.body.accessToken;
}

let staffSequence = 0;

/** Creates a staff user with this role and returns their id, token and an authed client. */
export async function loginAs(app: INestApplication<App>, role: Role) {
  staffSequence++;
  const credentials = {
    email: `${role}${staffSequence}@jali.rw`,
    password: OFFICER.password,
  };
  const user = await app
    .get(UsersService)
    .create(credentials.email, credentials.password, role);
  const token = await login(app, credentials);

  return { userId: user.id, token, api: client(app, token) };
}

/** A supertest client that sends the bearer token on every request. */
export function client(app: INestApplication<App>, token: string) {
  const server = app.getHttpServer();
  const auth = { Authorization: `Bearer ${token}` };

  return {
    get: (url: string) => request(server).get(url).set(auth),
    post: (url: string, body: object = {}) =>
      request(server).post(url).set(auth).send(body),
    patch: (url: string, body: object = {}) =>
      request(server).patch(url).set(auth).send(body),
  };
}

export type Client = ReturnType<typeof client>;

let uniqueSequence = 0;

/** A valid customer payload with a unique phone and national ID. */
export function customerPayload(overrides: Record<string, unknown> = {}) {
  uniqueSequence++;

  return {
    fullName: 'Aline Uwase',
    phone: `078${String(uniqueSequence).padStart(7, '0')}`,
    nationalId: `1199080${String(uniqueSequence).padStart(9, '0')}`,
    ...overrides,
  };
}

export async function createCustomer(
  api: Client,
  overrides: Record<string, unknown> = {},
) {
  const response = await api
    .post('/api/customers', customerPayload(overrides))
    .expect(201);

  return response.body.id as number;
}

export async function createLoan(
  api: Client,
  customerId: number,
  overrides: Record<string, unknown> = {},
) {
  const response = await api
    .post('/api/loans', {
      customerId,
      principal: 100_000,
      interestRate: 10,
      termMonths: 3,
      ...overrides,
    })
    .expect(201);

  return response.body.id as number;
}

/**
 * Asserts a 400 from ValidationPipe that mentions the field.
 * class-validator messages start with the property name, e.g. "phone must match ...".
 */
export function expectValidationError(
  response: request.Response,
  field: string,
): void {
  expect(response.status).toBe(400);
  const messages: string[] = [].concat(response.body.message);
  expect(messages.some((message) => message.startsWith(`${field} `))).toBe(
    true,
  );
}
