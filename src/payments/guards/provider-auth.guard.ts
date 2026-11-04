import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { CallbackCredentialsStore } from '../callback-credentials.js';
import {
  isFreshTimestamp,
  safeEqual,
  verifyCallbackSignature,
} from '../signature.js';

/**
 * Authenticates a payment provider's callback. All three checks must pass:
 * 1. `Authorization: Bearer <token>` matches that provider's callback token.
 * 2. `X-Timestamp` is within ±CALLBACK_TOLERANCE_SECONDS of now (replay protection).
 * 3. `X-Signature` is the HMAC of "<X-Timestamp>.<raw body>" with that provider's secret.
 *
 * The provider is read from the body, which is safe because the signature covers the
 * body: a caller cannot claim to be AIRTEL without AIRTEL's secret.
 * Every failure returns the same 401 so a caller can't tell which check failed.
 * The real reason is only logged.
 *
 * Runs before the ValidationPipe, so `request.body` is still the raw parsed JSON here.
 */
@Injectable()
export class ProviderAuthGuard implements CanActivate {
  private readonly logger = new Logger(ProviderAuthGuard.name);

  constructor(private readonly credentials: CallbackCredentialsStore) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    const provider: unknown = request.body?.provider;

    const reason = this.check(request, provider);
    if (reason) {
      this.logger.warn(
        `Rejected callback (provider=${String(provider).slice(0, 20)}, ip=${request.ip}): ${reason}`,
      );
      throw new UnauthorizedException('Invalid callback credentials.');
    }

    return true;
  }

  /** Returns why the request is not authentic, or undefined when it is. */
  private check(
    request: RawBodyRequest<Request>,
    provider: unknown,
  ): string | undefined {
    const credentials = this.credentials.get(provider);
    if (!credentials) {
      return 'unknown or unconfigured provider';
    }

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || !safeEqual(credentials.token, token)) {
      return 'bad token';
    }

    const timestamp = request.header('x-timestamp') ?? '';
    if (!isFreshTimestamp(timestamp, this.credentials.toleranceSeconds)) {
      return 'missing or stale X-Timestamp';
    }

    if (!request.rawBody) {
      // Means NestFactory.create was called without { rawBody: true }.
      this.logger.error('rawBody is not available; cannot verify signatures.');
      return 'raw body unavailable';
    }

    const signature = request.header('x-signature') ?? '';
    if (
      !verifyCallbackSignature(
        credentials.secret,
        timestamp,
        request.rawBody,
        signature,
      )
    ) {
      return 'bad signature';
    }

    return undefined;
  }
}
