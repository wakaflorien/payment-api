import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { App } from 'supertest/types.js';
import { createSwaggerDocument } from '../../src/swagger.js';
import { createTestApp } from './helpers.js';

describe('Swagger documentation', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createTestApp();
    document = createSwaggerDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const operation = (path: string, method: 'get' | 'post' | 'patch') =>
    document.paths[path]?.[method];

  it('documents every endpoint', () => {
    const documented = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(documented.sort()).toEqual(
      [
        'GET /api/auth/me',
        'GET /api/customers',
        'GET /api/loans/{id}',
        'GET /api/reports/portfolio',
        'GET /api/users',
        'PATCH /api/users/{id}',
        'POST /api/auth/login',
        'POST /api/customers',
        'POST /api/loans',
        'POST /api/loans/{loanId}/repayments',
        'POST /api/users',
        'GET /api/health',
        'GET /api/payments',
        'GET /api/payments/{id}',
        'POST /api/payments/{id}/reconcile',
        'POST /api/payments/callbacks',
        'GET /api/loans/{loanId}/payments',
        'POST /api/loans/{loanId}/payment-requests',
      ].sort(),
    );
  });

  it.each([
    ['/api/auth/me', 'get'],
    ['/api/customers', 'get'],
    ['/api/customers', 'post'],
    ['/api/loans', 'post'],
    ['/api/loans/{id}', 'get'],
    ['/api/loans/{loanId}/repayments', 'post'],
    ['/api/reports/portfolio', 'get'],
    ['/api/users', 'get'],
    ['/api/users', 'post'],
    ['/api/users/{id}', 'patch'],
    ['/api/payments', 'get'],
    ['/api/payments/{id}', 'get'],
    ['/api/payments/{id}/reconcile', 'post'],
    ['/api/loans/{loanId}/payments', 'get'],
    ['/api/loans/{loanId}/payment-requests', 'post'],
  ] as const)('marks %s %s as needing a bearer token', (path, method) => {
    expect(operation(path, method)?.security).toEqual([{ bearer: [] }]);
    expect(operation(path, method)?.responses).toHaveProperty('401');
  });

  it.each([
    ['/api/customers', 'post'],
    ['/api/loans', 'post'],
    ['/api/loans/{loanId}/repayments', 'post'],
    ['/api/reports/portfolio', 'get'],
    ['/api/users', 'get'],
    ['/api/users/{id}', 'patch'],
  ] as const)('documents the role-based 403 on %s %s', (path, method) => {
    expect(operation(path, method)?.responses).toHaveProperty('403');
  });

  it('leaves login and the health check public', () => {
    expect(operation('/api/auth/login', 'post')?.security).toBeUndefined();
    expect(operation('/api/health', 'get')?.security).toBeUndefined();
  });

  it('documents provider callbacks with their own token and signature headers', () => {
    const callback = operation('/api/payments/callbacks', 'post');

    expect(callback?.security).toEqual([{ 'provider-token': [] }]);
    expect(callback?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-Timestamp',
          in: 'header',
          required: true,
        }),
        expect.objectContaining({
          name: 'X-Signature',
          in: 'header',
          required: true,
        }),
      ]),
    );
    expect(Object.keys(callback?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '409',
      '422',
      '500',
    ]);
  });

  it('documents the repayment error codes a client must handle', () => {
    expect(
      Object.keys(
        operation('/api/loans/{loanId}/repayments', 'post')?.responses ?? {},
      ).sort(),
    ).toEqual(['201', '400', '401', '403', '404', '409', '422']);
  });

  it('describes request and response bodies with schemas', () => {
    const schemas = Object.keys(document.components?.schemas ?? {});

    expect(schemas).toEqual(
      expect.arrayContaining([
        'LoginDto',
        'LoginResponseDto',
        'CreateCustomerDto',
        'PaginatedCustomersDto',
        'CreateLoanDto',
        'LoanResponseDto',
        'CreateRepaymentDto',
        'RepaymentResponseDto',
        'PortfolioResponseDto',
        'CreateUserDto',
        'UserResponseDto',
        'ErrorResponseDto',
        'ProviderCallbackDto',
        'CallbackAckDto',
        'CreatePaymentRequestDto',
        'PaymentRequestResponseDto',
        'PaymentResponseDto',
        'PaginatedPaymentsDto',
      ]),
    );
  });
});
