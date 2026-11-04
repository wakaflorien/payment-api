import { Logger } from '@nestjs/common';
import { maskPhone } from '../../common/mask.js';
import { MobileMoneyProvider, PaymentStatus } from '../payment.enums.js';
import {
  CollectionRequest,
  PaymentProviderClient,
  ProviderStatusReport,
} from './payment-provider.js';

/**
 * Stands in for MTN/Airtel locally and in tests (PAYMENT_PROVIDER_MODE=simulator).
 * It accepts every request and never settles one by itself: send the signed callback
 * with `pnpm callback:send`, exactly as a real provider would.
 */
export class SimulatorClient implements PaymentProviderClient {
  private readonly logger = new Logger(SimulatorClient.name);

  constructor(readonly provider: MobileMoneyProvider) {}

  requestPayment(request: CollectionRequest): Promise<void> {
    this.logger.log(
      `[simulated ${this.provider}] prompting ${maskPhone(request.phone)} to pay ` +
        `${request.amount} ${request.currency}. Settle it with: ` +
        `pnpm callback:send ${this.provider} ${request.transactionId} ${request.amount} SUCCESS`,
    );

    return Promise.resolve();
  }

  getStatus(): Promise<ProviderStatusReport | null> {
    return Promise.resolve({ status: PaymentStatus.Pending });
  }
}
