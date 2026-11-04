/**
 * Runs before every e2e file. Real environment variables win over .env in
 * @nestjs/config, so these point the app at the separate jali_test database.
 */
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '3306';
process.env.DB_USERNAME ??= 'jali';
process.env.DB_PASSWORD ??= 'jali_secret';
process.env.DB_DATABASE = 'jali_test';
process.env.DB_SYNCHRONIZE = 'true';
process.env.JWT_SECRET = 'test-secret';

// Payments: no network calls, no background job (tests run reconciliation by hand),
// and fixed callback credentials so tests can sign callbacks like a provider would.
process.env.PAYMENT_PROVIDER_MODE = 'simulator';
process.env.RECONCILIATION_INTERVAL_MS = '0';
process.env.MTN_CALLBACK_TOKEN = 'test-mtn-callback-token';
process.env.MTN_CALLBACK_SECRET = 'test-mtn-callback-signing-secret-0123456789';
process.env.AIRTEL_CALLBACK_TOKEN = 'test-airtel-callback-token';
process.env.AIRTEL_CALLBACK_SECRET =
  'test-airtel-callback-signing-secret-0123456';
process.env.CALLBACK_TOLERANCE_SECONDS = '300';
