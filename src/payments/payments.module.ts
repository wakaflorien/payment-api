import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity.js';
import { Loan } from '../loans/entities/loan.entity.js';
import { CallbackCredentialsStore } from './callback-credentials.js';
import { PaymentCallback } from './entities/payment-callback.entity.js';
import { Payment } from './entities/payment.entity.js';
import { ProviderAuthGuard } from './guards/provider-auth.guard.js';
import { PaymentCallbacksController } from './payment-callbacks.controller.js';
import { PaymentCallbacksService } from './payment-callbacks.service.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';
import { PaymentRequestsService } from './payment-requests.service.js';
import {
  LoanPaymentsController,
  PaymentsController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentProviderRegistry } from './providers/payment-provider.registry.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentCallback, Loan, Customer]),
  ],
  controllers: [
    PaymentCallbacksController,
    PaymentsController,
    LoanPaymentsController,
  ],
  providers: [
    PaymentsService,
    PaymentCallbacksService,
    PaymentRequestsService,
    PaymentReconciliationService,
    PaymentProviderRegistry,
    CallbackCredentialsStore,
    ProviderAuthGuard,
  ],
})
export class PaymentsModule {}
