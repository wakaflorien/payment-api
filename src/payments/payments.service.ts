import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { Loan, LoanStatus } from '../loans/entities/loan.entity.js';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';
import {
  PaginatedPaymentsDto,
  PaymentResponseDto,
  toPaymentResponse,
} from './dto/payment-response.dto.js';
import { Payment } from './entities/payment.entity.js';
import {
  CallbackOutcome,
  MobileMoneyProvider,
  PaymentStatus,
} from './payment.enums.js';

export const PAYMENTS_PER_PAGE = 15;

/** What a provider told us about one transaction, by callback or by status query. */
export interface ProviderResult {
  provider: MobileMoneyProvider;
  transactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** When the provider says it happened. */
  occurredAt?: Date;
  reason?: string;
}

export type ApplyResult =
  | {
      outcome:
        | CallbackOutcome.Applied
        | CallbackOutcome.Duplicate
        | CallbackOutcome.NoChange;
      payment: Payment;
    }
  | {
      outcome: CallbackOutcome.Conflict | CallbackOutcome.Rejected;
      payment: Payment;
      detail: string;
    }
  | { outcome: CallbackOutcome.Unmatched };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
  ) {}

  /**
   * The one place where a provider's verdict changes money. Callbacks and the
   * reconciliation job both come through here, so they behave the same way.
   *
   * Everything happens in one transaction: the payment status and the loan balance
   * are committed together or not at all.
   *
   * - Idempotent: a final status is never applied twice. The same verdict again is a
   *   DUPLICATE (no-op); a contradicting one is a CONFLICT.
   * - Concurrency-safe: the loan row is locked (SELECT ... FOR UPDATE), so payments for
   *   the same loan apply one after another and each sees the real balance. The lock
   *   order is always loan, then payment, as in RepaymentsService, so there is no deadlock cycle.
   * - Never loses money: if a race already cleared the loan, the surplus is kept as
   *   `unappliedAmount` (to refund) rather than rejected. The provider has already
   *   collected it, so refusing the callback would not undo that.
   */
  async applyProviderResult(result: ProviderResult): Promise<ApplyResult> {
    const known = await this.payments.findOne({
      where: { provider: result.provider, transactionId: result.transactionId },
      select: { id: true, loanId: true },
    });
    if (!known) {
      return { outcome: CallbackOutcome.Unmatched };
    }

    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOneOrFail(Loan, {
        where: { id: known.loanId },
        lock: { mode: 'pessimistic_write' },
      });
      const payment = await manager.findOneOrFail(Payment, {
        where: { id: known.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        result.amount !== payment.amount ||
        result.currency !== payment.currency
      ) {
        return {
          outcome: CallbackOutcome.Rejected,
          payment,
          detail:
            `Expected ${payment.amount} ${payment.currency} but the provider reported ` +
            `${result.amount} ${result.currency}. Left for manual review.`,
        };
      }

      if (payment.status !== PaymentStatus.Pending) {
        return payment.status === result.status
          ? { outcome: CallbackOutcome.Duplicate, payment }
          : {
              outcome: CallbackOutcome.Conflict,
              payment,
              detail: `This payment is already ${payment.status}; it cannot become ${result.status}.`,
            };
      }

      if (result.status === PaymentStatus.Pending) {
        return { outcome: CallbackOutcome.NoChange, payment };
      }

      payment.providerTimestamp = result.occurredAt ?? null;
      payment.completedAt = new Date();
      payment.nextReconcileAt = null;

      if (result.status === PaymentStatus.Failed) {
        // No money moved, so the loan is not touched.
        payment.status = PaymentStatus.Failed;
        payment.failureReason = (
          result.reason ?? 'Reported as failed by the provider.'
        ).slice(0, 255);
        await manager.save(payment);

        return { outcome: CallbackOutcome.Applied, payment };
      }

      const applied =
        loan.status === LoanStatus.Active
          ? Math.min(payment.amount, loan.outstanding)
          : 0;
      if (applied > 0) {
        loan.outstanding -= applied;
        if (loan.outstanding === 0) {
          loan.status = LoanStatus.Closed;
        }
        await manager.save(loan);
      }

      payment.status = PaymentStatus.Success;
      payment.appliedAmount = applied;
      payment.unappliedAmount = payment.amount - applied;
      await manager.save(payment);

      if (payment.unappliedAmount > 0) {
        this.logger.warn(
          `Payment ${payment.id} on loan ${loan.id}: ${payment.unappliedAmount} ${payment.currency} ` +
            'could not be applied (loan already cleared) and must be refunded.',
        );
      }

      return { outcome: CallbackOutcome.Applied, payment };
    });
  }

  async findAll(query: ListPaymentsQueryDto): Promise<PaginatedPaymentsDto> {
    // TypeORM 1.x throws on `undefined` in where, so only add the filters that were given.
    const where: FindOptionsWhere<Payment> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.provider) {
      where.provider = query.provider;
    }
    if (query.loanId) {
      where.loanId = query.loanId;
    }
    const [payments, total] = await this.payments.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (query.page - 1) * PAYMENTS_PER_PAGE,
      take: PAYMENTS_PER_PAGE,
    });

    return {
      data: payments.map(toPaymentResponse),
      meta: {
        page: query.page,
        limit: PAYMENTS_PER_PAGE,
        total,
        totalPages: Math.ceil(total / PAYMENTS_PER_PAGE),
      },
    };
  }

  async findOne(id: number): Promise<Payment> {
    const payment = await this.payments.findOneBy({ id });
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }

  /** Every attempt for one loan, newest first, including PENDING and FAILED ones. */
  async findByLoan(loanId: number): Promise<PaymentResponseDto[]> {
    if (!(await this.loans.existsBy({ id: loanId }))) {
      throw new NotFoundException('Loan not found.');
    }
    const payments = await this.payments.find({
      where: { loanId },
      order: { id: 'DESC' },
    });

    return payments.map(toPaymentResponse);
  }
}
