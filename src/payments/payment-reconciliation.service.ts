import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity.js';
import {
  CallbackOutcome,
  MOBILE_MONEY_PROVIDERS,
  MobileMoneyProvider,
  PaymentStatus,
} from './payment.enums.js';
import { PaymentsService } from './payments.service.js';
import { ProviderUnavailableError } from './providers/payment-provider.js';
import { PaymentProviderRegistry } from './providers/payment-provider.registry.js';

const BATCH_SIZE = 50;
const MAX_BACKOFF_MINUTES = 60;

/**
 * Safety net for callbacks that never arrive or that we failed to process:
 * every RECONCILIATION_INTERVAL_MS it asks the provider about PENDING payments that
 * are due, and feeds the answer into the same applyProviderResult() as callbacks.
 *
 * - Backoff: checks at +2, 4, 8, 16, 32, then every 60 minutes.
 * - Multiple instances: due rows are claimed with SELECT ... FOR UPDATE SKIP LOCKED and
 *   their next check is pushed back in the same transaction, so two instances never
 *   pick the same payment. Even if they did, applyProviderResult is idempotent.
 * - Expiry: if the provider has no record of a payment after PENDING_EXPIRY_HOURS,
 *   it is marked FAILED. A provider saying "still pending" never expires it.
 */
@Injectable()
export class PaymentReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly payments: PaymentsService,
    private readonly providers: PaymentProviderRegistry,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(
      this.config.get('RECONCILIATION_INTERVAL_MS') ?? 60_000,
    );
    if (intervalMs <= 0) {
      this.logger.log('Payment reconciliation job is disabled.');
      return;
    }
    const handle = setInterval(() => void this.runOnce(), intervalMs);
    this.scheduler.addInterval('payment-reconciliation', handle);
  }

  /** One pass. Returns how many payments were checked. Never throws. */
  async runOnce(now = new Date()): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const due = await this.claimDue(now);
      for (const payment of due) {
        await this.reconcile(payment, now);
      }

      return due.length;
    } catch (error) {
      this.logger.error(
        'Reconciliation pass failed',
        error instanceof Error ? error.stack : String(error),
      );

      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Asks the provider about one PENDING payment and applies the answer.
   * Returns the payment as it is afterwards.
   */
  async reconcile(payment: Payment, now = new Date()): Promise<Payment> {
    if (
      payment.status !== PaymentStatus.Pending ||
      !MOBILE_MONEY_PROVIDERS.includes(payment.provider as MobileMoneyProvider)
    ) {
      return payment;
    }
    const provider = payment.provider as MobileMoneyProvider;

    try {
      const report = await this.providers
        .get(provider)
        .getStatus(payment.transactionId);

      if (report === null) {
        await this.expireIfTooOld(payment, now);
      } else if (report.status !== PaymentStatus.Pending) {
        const result = await this.payments.applyProviderResult({
          provider,
          transactionId: payment.transactionId,
          status: report.status,
          amount: report.amount ?? payment.amount,
          currency: report.currency ?? payment.currency,
          reason: report.reason,
        });
        if ('detail' in result) {
          this.logger.error(
            `Payment ${payment.id} needs manual review (${result.outcome}): ${result.detail}`,
          );
        } else if (result.outcome === CallbackOutcome.Applied) {
          this.logger.log(
            `Payment ${payment.id} settled by reconciliation: ${report.status}.`,
          );
        }
      }
    } catch (error) {
      if (!(error instanceof ProviderUnavailableError)) {
        throw error;
      }
      this.logger.warn(
        `Payment ${payment.id}: ${error.message}. Will retry at the next check.`,
      );
    }

    return this.payments.findOne(payment.id);
  }

  private claimDue(now: Date): Promise<Payment[]> {
    return this.dataSource.transaction(async (manager) => {
      const due = await manager
        .createQueryBuilder(Payment, 'payment')
        .where('payment.status = :status', { status: PaymentStatus.Pending })
        .andWhere('payment.provider IN (:...providers)', {
          providers: MOBILE_MONEY_PROVIDERS,
        })
        .andWhere('payment.nextReconcileAt <= :now', { now })
        .orderBy('payment.nextReconcileAt', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      for (const payment of due) {
        payment.reconcileAttempts += 1;
        const delayMinutes = Math.min(
          2 ** payment.reconcileAttempts,
          MAX_BACKOFF_MINUTES,
        );
        payment.nextReconcileAt = new Date(
          now.getTime() + delayMinutes * 60_000,
        );
        await manager.update(Payment, payment.id, {
          reconcileAttempts: payment.reconcileAttempts,
          nextReconcileAt: payment.nextReconcileAt,
        });
      }

      return due;
    });
  }

  private async expireIfTooOld(payment: Payment, now: Date): Promise<void> {
    const expiryMs =
      Number(this.config.get('PENDING_EXPIRY_HOURS') ?? 24) * 3_600_000;
    if (now.getTime() - payment.createdAt.getTime() < expiryMs) {
      return;
    }
    const { affected } = await this.dataSource.getRepository(Payment).update(
      { id: payment.id, status: PaymentStatus.Pending },
      {
        status: PaymentStatus.Failed,
        failureReason:
          'Expired: the provider has no record of this transaction.',
        completedAt: now,
        nextReconcileAt: null,
      },
    );
    if (affected) {
      this.logger.warn(`Payment ${payment.id} expired and was marked FAILED.`);
    }
  }
}
