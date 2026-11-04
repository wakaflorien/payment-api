#!/usr/bin/env node
/**
 * Plays the payment provider: signs and sends a callback to the API, exactly as
 * MTN/Airtel would (see src/payments/signature.ts for the scheme).
 *
 *   pnpm callback:send <MTN|AIRTEL> <transactionId> <amount> [SUCCESS|FAILED|PENDING] [times]
 *
 *   pnpm callback:send MTN 0b7f1c1e-... 20000 SUCCESS      # settle a payment request
 *   pnpm callback:send MTN 0b7f1c1e-... 20000 SUCCESS 3    # the same callback 3 times (idempotency)
 *
 * Reads <PROVIDER>_CALLBACK_TOKEN / _SECRET from the environment or .env, and posts to
 * API_URL (default http://localhost:3000). It is a provider-side tool, so it carries its
 * own copy of the HMAC code rather than importing the API's.
 */
import { createHmac } from 'node:crypto';

try {
  process.loadEnvFile();
} catch {
  // No .env: use the real environment.
}

const [provider = 'MTN', transactionId, amount, status = 'SUCCESS', times = '1'] =
  process.argv.slice(2);
if (!transactionId || !amount) {
  console.error(
    'Usage: pnpm callback:send <MTN|AIRTEL> <transactionId> <amount> [SUCCESS|FAILED|PENDING] [times]',
  );
  process.exit(1);
}

const token = process.env[`${provider}_CALLBACK_TOKEN`];
const secret = process.env[`${provider}_CALLBACK_SECRET`];
if (!token || !secret) {
  console.error(`${provider}_CALLBACK_TOKEN and ${provider}_CALLBACK_SECRET must be set.`);
  process.exit(1);
}

const body = JSON.stringify({
  provider,
  transaction_id: transactionId,
  amount: String(amount),
  currency: 'RWF',
  status,
  timestamp: new Date().toISOString(),
  ...(status === 'FAILED' ? { reason: 'Payer declined the prompt' } : {}),
});
const url = `${process.env.API_URL ?? 'http://localhost:3000'}/api/payments/callbacks`;

for (let attempt = 1; attempt <= Number(times); attempt++) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature =
    'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,
  });
  console.log(`#${attempt} HTTP ${response.status}`, await response.text());
}
