import {
  isFreshTimestamp,
  safeEqual,
  signCallback,
  verifyCallbackSignature,
} from './signature.js';

describe('callback signature', () => {
  const secret = 'a-very-long-callback-signing-secret-for-tests';
  const body = '{"provider":"MTN","transaction_id":"MTNN848","amount":"5000"}';
  const timestamp = '1793356200';

  it('produces a sha256= prefixed hex HMAC of "<timestamp>.<body>"', () => {
    expect(signCallback(secret, timestamp, body)).toMatch(
      /^sha256=[0-9a-f]{64}$/,
    );
  });

  it('accepts the signature it produced', () => {
    const signature = signCallback(secret, timestamp, body);

    expect(verifyCallbackSignature(secret, timestamp, body, signature)).toBe(
      true,
    );
  });

  it('rejects a tampered body, timestamp or secret', () => {
    const signature = signCallback(secret, timestamp, body);

    expect(
      verifyCallbackSignature(
        secret,
        timestamp,
        body.replace('5000', '9000'),
        signature,
      ),
    ).toBe(false);
    expect(verifyCallbackSignature(secret, '1793356201', body, signature)).toBe(
      false,
    );
    expect(
      verifyCallbackSignature('another-secret', timestamp, body, signature),
    ).toBe(false);
    expect(verifyCallbackSignature(secret, timestamp, body, 'sha256=')).toBe(
      false,
    );
  });

  it('treats a Buffer body the same as its string', () => {
    expect(signCallback(secret, timestamp, Buffer.from(body))).toBe(
      signCallback(secret, timestamp, body),
    );
  });

  it('only accepts timestamps inside the tolerance window', () => {
    const now = 1_793_356_200_000;

    expect(isFreshTimestamp('1793356200', 300, now)).toBe(true);
    expect(isFreshTimestamp('1793355900', 300, now)).toBe(true);
    expect(isFreshTimestamp('1793355899', 300, now)).toBe(false);
    expect(isFreshTimestamp('1793356501', 300, now)).toBe(false);
    expect(isFreshTimestamp('not-a-number', 300, now)).toBe(false);
    expect(isFreshTimestamp('', 300, now)).toBe(false);
  });

  it('compares strings of different lengths without throwing', () => {
    expect(safeEqual('token', 'token')).toBe(true);
    expect(safeEqual('token', 'token-but-longer')).toBe(false);
  });
});
