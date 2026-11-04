import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MOBILE_MONEY_PROVIDERS,
  MobileMoneyProvider,
} from './payment.enums.js';

export interface CallbackCredentials {
  /** Sent by the provider as `Authorization: Bearer <token>`. */
  token: string;
  /** Used for the HMAC in X-Signature. Never sent over the wire. */
  secret: string;
}

/**
 * Per-provider callback secrets, read once from the environment
 * (MTN_CALLBACK_TOKEN / MTN_CALLBACK_SECRET, AIRTEL_CALLBACK_TOKEN / AIRTEL_CALLBACK_SECRET).
 * A provider without both values cannot authenticate, so its callbacks get 401.
 */
@Injectable()
export class CallbackCredentialsStore {
  private readonly logger = new Logger(CallbackCredentialsStore.name);
  private readonly credentials = new Map<string, CallbackCredentials>();
  readonly toleranceSeconds: number;

  constructor(config: ConfigService) {
    for (const provider of MOBILE_MONEY_PROVIDERS) {
      const token = config.get<string>(`${provider}_CALLBACK_TOKEN`);
      const secret = config.get<string>(`${provider}_CALLBACK_SECRET`);
      if (token && secret) {
        this.credentials.set(provider, { token, secret });
      } else {
        this.logger.warn(
          `${provider} callback credentials are not configured; its callbacks will be rejected.`,
        );
      }
    }
    this.toleranceSeconds = Number(
      config.get('CALLBACK_TOLERANCE_SECONDS') ?? 300,
    );
  }

  /** Undefined for an unknown provider name, or one without configured secrets. */
  get(provider: unknown): CallbackCredentials | undefined {
    return typeof provider === 'string'
      ? this.credentials.get(provider as MobileMoneyProvider)
      : undefined;
  }
}
