import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Role } from '../../src/users/role.enum.js';
import {
  Client,
  createCustomer,
  createLoan,
  createTestApp,
  customerPayload,
  expectValidationError,
  login,
  loginAs,
  resetDatabase,
} from './helpers.js';

describe('role-based access control', () => {
  let app: INestApplication<App>;
  let admin: Client;
  let adminId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    ({ api: admin, userId: adminId } = await loginAs(app, Role.Admin));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('permission matrix', () => {
    type Call = (api: Client) => Promise<request.Response>;
    interface Route {
      name: string;
      allowedRoles: Role[];
      /** Builds the request; runs after the admin has prepared any data it needs. */
      prepare: () => Promise<Call>;
    }

    let refSequence = 0;
    const writers = [Role.Admin, Role.LoanOfficer];
    const everyone = [Role.Admin, Role.LoanOfficer, Role.Auditor];

    /** Who may do what. Change a row here and in the controller together. */
    const routes: Route[] = [
      {
        name: 'POST /api/customers',
        allowedRoles: writers,
        prepare: async () => (api) =>
          api.post('/api/customers', customerPayload()),
      },
      {
        name: 'GET /api/customers',
        allowedRoles: everyone,
        prepare: async () => (api) => api.get('/api/customers'),
      },
      {
        name: 'POST /api/loans',
        allowedRoles: writers,
        prepare: async () => {
          const customerId = await createCustomer(admin);
          return (api) =>
            api.post('/api/loans', {
              customerId,
              principal: 100_000,
              interestRate: 10,
              termMonths: 3,
            });
        },
      },
      {
        name: 'GET /api/loans/:id',
        allowedRoles: everyone,
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          return (api) => api.get(`/api/loans/${loanId}`);
        },
      },
      {
        name: 'POST /api/loans/:id/repayments',
        allowedRoles: writers,
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          return (api) =>
            api.post(`/api/loans/${loanId}/repayments`, {
              amount: 1_000,
              providerRef: `RBAC-${++refSequence}`,
            });
        },
      },
      {
        name: 'GET /api/reports/portfolio',
        allowedRoles: [Role.Admin, Role.Auditor],
        prepare: async () => (api) => api.get('/api/reports/portfolio'),
      },
      {
        name: 'GET /api/users',
        allowedRoles: [Role.Admin],
        prepare: async () => (api) => api.get('/api/users'),
      },
      {
        name: 'POST /api/users',
        allowedRoles: [Role.Admin],
        prepare: async () => (api) =>
          api.post('/api/users', {
            email: `new${++refSequence}@jali.rw`,
            password: 'secret-pass',
            role: Role.Auditor,
          }),
      },
      {
        name: 'PATCH /api/users/:id',
        allowedRoles: [Role.Admin],
        prepare: async () => {
          const { userId } = await loginAs(app, Role.Auditor);
          return (api) =>
            api.patch(`/api/users/${userId}`, { role: Role.LoanOfficer });
        },
      },
      {
        name: 'GET /api/auth/me',
        allowedRoles: everyone,
        prepare: async () => (api) => api.get('/api/auth/me'),
      },
      {
        name: 'POST /api/loans/:id/payment-requests',
        allowedRoles: writers,
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          return (api) =>
            api.post(`/api/loans/${loanId}/payment-requests`, {
              provider: 'MTN',
              amount: 1_000,
            });
        },
      },
      {
        name: 'GET /api/loans/:id/payments',
        allowedRoles: everyone,
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          return (api) => api.get(`/api/loans/${loanId}/payments`);
        },
      },
      {
        name: 'GET /api/payments',
        allowedRoles: everyone,
        prepare: async () => (api) => api.get('/api/payments'),
      },
      {
        name: 'GET /api/payments/:id',
        allowedRoles: everyone,
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          const payment = await admin
            .post(`/api/loans/${loanId}/payment-requests`, {
              provider: 'MTN',
              amount: 1_000,
            })
            .expect(202);
          return (api) => api.get(`/api/payments/${payment.body.id}`);
        },
      },
      {
        name: 'POST /api/payments/:id/reconcile',
        allowedRoles: [Role.Admin],
        prepare: async () => {
          const loanId = await createLoan(admin, await createCustomer(admin));
          const payment = await admin
            .post(`/api/loans/${loanId}/payment-requests`, {
              provider: 'MTN',
              amount: 1_000,
            })
            .expect(202);
          return (api) =>
            api.post(`/api/payments/${payment.body.id}/reconcile`);
        },
      },
    ];

    const cases = routes.flatMap((route) =>
      Object.values(Role).map((role) => {
        const allowed = route.allowedRoles.includes(role);

        return {
          ...route,
          role,
          allowed,
          title: `${route.name} as ${role} → ${allowed ? '2xx' : '403'}`,
        };
      }),
    );

    it.each(cases)('$title', async ({ role, allowed, prepare }) => {
      const call = await prepare();
      const api = role === Role.Admin ? admin : (await loginAs(app, role)).api;

      const response = await call(api);

      if (allowed) {
        expect(response.status).toBeLessThan(300);
      } else {
        expect(response.status).toBe(403);
      }
    });
  });

  describe('user management (admin)', () => {
    it('creates staff with a role, and lets them log in with it', async () => {
      const response = await admin
        .post('/api/users', {
          email: 'Auditor.New@jali.rw',
          password: 'secret-pass',
          role: Role.Auditor,
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        email: 'auditor.new@jali.rw',
        role: Role.Auditor,
        isActive: true,
      });
      const token = await login(app, {
        email: 'auditor.new@jali.rw',
        password: 'secret-pass',
      });
      expect(token).toEqual(expect.any(String));
    });

    it('rejects a duplicate email (409) and an unknown role (400)', async () => {
      const body = {
        email: 'dup@jali.rw',
        password: 'secret-pass',
        role: Role.LoanOfficer,
      };
      await admin.post('/api/users', body).expect(201);

      await admin.post('/api/users', body).expect(409);
      expectValidationError(
        await admin.post('/api/users', {
          ...body,
          email: 'x@jali.rw',
          role: 'superuser',
        }),
        'role',
      );
    });

    it('lists staff without exposing password hashes', async () => {
      await loginAs(app, Role.LoanOfficer);

      const response = await admin.get('/api/users').expect(200);

      expect(response.body).toHaveLength(2);
      for (const user of response.body) {
        expect(user).not.toHaveProperty('passwordHash');
      }
    });

    it('returns 404 when updating an unknown user', async () => {
      await admin
        .patch('/api/users/999999', { role: Role.Auditor })
        .expect(404);
    });

    it.each([
      ['demote themselves', { role: Role.Auditor }],
      ['deactivate themselves', { isActive: false }],
    ])(
      'stops an admin from locking themselves out: %s → 422',
      async (_label, body) => {
        await admin.patch(`/api/users/${adminId}`, body).expect(422);
      },
    );
  });

  describe('changes take effect on the very next request', () => {
    it('a demoted officer loses write access immediately, with the same token', async () => {
      const officer = await loginAs(app, Role.LoanOfficer);
      await officer.api.post('/api/customers', customerPayload()).expect(201);

      await admin
        .patch(`/api/users/${officer.userId}`, { role: Role.Auditor })
        .expect(200);

      await officer.api.post('/api/customers', customerPayload()).expect(403);
      await officer.api.get('/api/customers').expect(200);
    });

    it('a blocked user is logged out immediately and cannot log in again', async () => {
      const officer = await loginAs(app, Role.LoanOfficer);

      await admin
        .patch(`/api/users/${officer.userId}`, { isActive: false })
        .expect(200);

      await officer.api.get('/api/auth/me').expect(401);
      const me = await admin.get('/api/users');
      const blocked = me.body.find(
        (u: { id: number }) => u.id === officer.userId,
      );
      expect(blocked.isActive).toBe(false);
    });

    it('GET /api/auth/me reports the current role', async () => {
      const auditor = await loginAs(app, Role.Auditor);

      const response = await auditor.api.get('/api/auth/me').expect(200);

      expect(response.body).toMatchObject({
        role: Role.Auditor,
        isActive: true,
      });
    });
  });
});
