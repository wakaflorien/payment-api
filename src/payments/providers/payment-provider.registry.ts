import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MOBILE_MONEY_PROVIDERS,
  MobileMoneyProvider,
  PaymentProvider,
} from '../payment.enums.js';
import { AirtelMoneyClient } from './airtel-money.client.js';
import { MtnMomoClient } from './mtn-momo.client.js';
import { PaymentProviderClient } from './payment-provider.js';
import { SimulatorClient } from './simulator.client.js';

/**
 * Picks an adapter per provider:
 * - PAYMENT_PROVIDER_MODE=simulator (default): no network, settle with `pnpm callback:send`.
 * - PAYMENT_PROVIDER_MODE=http: real HTTP calls to MTN_BASE_URL / AIRTEL_BASE_URL
 *   (their sandboxes, or production hosts).
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly clients = new Map<
    MobileMoneyProvider,
    PaymentProviderClient
  >();

  constructor(config: ConfigService) {
    const mode = config.get<string>('PAYMENT_PROVIDER_MODE') ?? 'simulator';
    const timeoutMs = Number(config.get('PROVIDER_TIMEOUT_MS') ?? 10_000);

    if (mode === 'http') {
      this.clients.set(
        PaymentProvider.Mtn,
        new MtnMomoClient({
          baseUrl:
            config.get('MTN_BASE_URL') ??
            'https://sandbox.momodeveloper.mtn.com',
          subscriptionKey: config.getOrThrow('MTN_SUBSCRIPTION_KEY'),
          apiUser: config.getOrThrow('MTN_API_USER'),
          apiKey: config.getOrThrow('MTN_API_KEY'),
          targetEnvironment: config.get('MTN_TARGET_ENVIRONMENT') ?? 'sandbox',
          timeoutMs,
        }),
      );
      this.clients.set(
        PaymentProvider.Airtel,
        new AirtelMoneyClient({
          baseUrl:
            config.get('AIRTEL_BASE_URL') ?? 'https://openapiuat.airtel.africa',
          clientId: config.getOrThrow('AIRTEL_CLIENT_ID'),
          clientSecret: config.getOrThrow('AIRTEL_CLIENT_SECRET'),
          timeoutMs,
        }),
      );
    } else {
      for (const provider of MOBILE_MONEY_PROVIDERS) {
        this.clients.set(provider, new SimulatorClient(provider));
      }
    }
    this.logger.log(`Payment providers running in "${mode}" mode.`);
  }

  get(provider: MobileMoneyProvider): PaymentProviderClient {
    const client = this.clients.get(provider);
    if (!client) {
      throw new Error(`No payment provider client for ${provider}.`);
    }

    return client;
  }
}
