import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Provider callback authentication. Pure functions, no framework code.
 *
 * The provider sends three headers:
 *   Authorization: Bearer <callback token>     shared secret #1: who is calling
 *   X-Timestamp:   <unix seconds>              when the request was sent
 *   X-Signature:   sha256=<hex>                HMAC-SHA256(secret #2, "<X-Timestamp>.<raw body>")
 *
 * The HMAC proves the body was not changed and binds it to the timestamp, so a
 * captured request cannot be replayed outside the tolerance window.
 */
export const SIGNATURE_PREFIX = 'sha256=';

export function signCallback(
  secret: string,
  timestamp: string,
  rawBody: string | Buffer,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  return `${SIGNATURE_PREFIX}${digest}`;
}

export function verifyCallbackSignature(
  secret: string,
  timestamp: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  return safeEqual(signCallback(secret, timestamp, rawBody), signature);
}

/** True when `timestamp` (unix seconds) is within `toleranceSeconds` of `nowMs`. */
export function isFreshTimestamp(
  timestamp: string,
  toleranceSeconds: number,
  nowMs = Date.now(),
): boolean {
  if (!/^\d{1,12}$/.test(timestamp)) {
    return false;
  }

  return Math.abs(nowMs / 1000 - Number(timestamp)) <= toleranceSeconds;
}

/**
 * Constant-time string comparison. Both sides are hashed first so the comparison
 * takes the same time whatever their lengths, and timingSafeEqual gets equal-length input.
 */
export function safeEqual(expected: string, actual: string): boolean {
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(actual).digest();

  return timingSafeEqual(a, b);
}
