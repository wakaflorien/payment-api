import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { maskPhone } from '../common/mask.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { Loan, LoanStatus } from '../loans/entities/loan.entity.js';
import {
  CreatePaymentRequestDto,
  PaymentRequestResponseDto,
} from './dto/create-payment-request.dto.js';
import { toPaymentResponse } from './dto/payment-response.dto.js';
import { Payment } from './entities/payment.entity.js';
import { CURRENCY, PaymentStatus } from './payment.enums.js';
import { ProviderRejectedError } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/payment-provider.registry.js';

/** First time the reconciliation job asks the provider about a PENDING payment. */
const FIRST_RECONCILE_DELAY_MS = 2 * 60_000;

/**
 * Starts a repayment by asking MTN/Airtel to prompt the customer (a "collection").
 *
 * Order matters:
 * 1. Commit a PENDING payment first, in a short transaction that locks the loan.
 *    From then on any callback, including a late one, has a row to match.
 * 2. Only then call the provider, outside any transaction: never hold a row lock
 *    across a network call.
 * 3. Interpret the answer. Rejected -> FAILED. Timeout or 5xx -> stays PENDING,
 *    because the provider may have accepted it.
 */
@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger(PaymentRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly providers: PaymentProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  async create(
    loanId: number,
    dto: CreatePaymentRequestDto,
  ): Promise<PaymentRequestResponseDto> {
    const payment = await this.reserve(loanId, dto);

    try {
      await this.providers.get(dto.provider).requestPayment({
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        phone: payment.payerPhone!,
        callbackUrl: this.config.get<string>('PAYMENT_CALLBACK_URL'),
        description: `Jali loan ${loanId} repayment`,
      });
    } catch (error) {
      if (error instanceof ProviderRejectedError) {
        await this.markRejected(payment, error.reason);
        throw new BadGatewayException(
          `${dto.provider} rejected the payment request (${error.reason}). Payment ${payment.id} is FAILED.`,
        );
      }
      // Timeout, network error, 5xx: unknown outcome. Keep it PENDING; a callback or
      // the reconciliation job will settle it.
      this.logger.warn(
        `Payment ${payment.id} (${dto.provider} ${payment.transactionId}): outcome unknown, kept PENDING. ` +
          (error instanceof Error ? error.message : String(error)),
      );

      return Object.assign(toPaymentResponse(payment), {
        providerResponse: 'UNKNOWN' as const,
      });
    }

    this.logger.log(
      `Payment ${payment.id}: asked ${dto.provider} to collect ${payment.amount} ${payment.currency} ` +
        `from ${maskPhone(payment.payerPhone!)} for loan ${loanId}.`,
    );

    return Object.assign(toPaymentResponse(payment), {
      providerResponse: 'ACCEPTED' as const,
    });
  }

  /**
   * Locks the loan so two officers can't request more than the balance at the same
   * moment, then commits the PENDING payment.
   */
  private reserve(
    loanId: number,
    dto: CreatePaymentRequestDto,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, {
        where: { id: loanId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!loan) {
        throw new NotFoundException('Loan not found.');
      }
      if (loan.status !== LoanStatus.Active) {
        throw new UnprocessableEntityException('This loan is not active.');
      }

      const pending = Number(
        (await manager.sum(Payment, 'amount', {
          loanId,
          status: PaymentStatus.Pending,
        })) ?? 0,
      );
      if (dto.amount > loan.outstanding - pending) {
        throw new UnprocessableEntityException(
          `Amount exceeds the outstanding balance of ${loan.outstanding} RWF` +
            (pending > 0 ? ` minus ${pending} RWF already requested.` : '.'),
        );
      }

      const phone =
        dto.phone ??
        (await manager.findOneByOrFail(Customer, { id: loan.customerId }))
          .phone;

      return manager.save(
        manager.create(Payment, {
          loanId,
          provider: dto.provider,
          // A UUID: MTN requires X-Reference-Id to be one, and it can't be guessed.
          transactionId: randomUUID(),
          amount: dto.amount,
          appliedAmount: 0,
          unappliedAmount: 0,
          currency: CURRENCY,
          status: PaymentStatus.Pending,
          payerPhone: phone,
          nextReconcileAt: new Date(Date.now() + FIRST_RECONCILE_DELAY_MS),
        }),
      );
    });
  }

  /** Conditional update: if a callback already settled it, leave it alone. */
  private async markRejected(payment: Payment, reason: string): Promise<void> {
    await this.dataSource.getRepository(Payment).update(
      { id: payment.id, status: PaymentStatus.Pending },
      {
        status: PaymentStatus.Failed,
        failureReason: `Rejected by provider: ${reason}`.slice(0, 255),
        completedAt: new Date(),
        nextReconcileAt: null,
      },
    );
  }
}
