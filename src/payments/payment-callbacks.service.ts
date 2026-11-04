import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CallbackAckDto,
  ProviderCallbackDto,
} from './dto/provider-callback.dto.js';
import { PaymentCallback } from './entities/payment-callback.entity.js';
import { CallbackOutcome } from './payment.enums.js';
import { ApplyResult, PaymentsService } from './payments.service.js';

/**
 * Turns an authenticated, validated provider callback into a ledger update and an
 * HTTP answer the provider understands:
 *
 *   2xx -> "got it, stop retrying"   (applied, duplicate or still pending)
 *   4xx -> "this will never succeed" (unknown transaction, conflict, mismatch)
 *   5xx -> "try again later"         (our database failed; nothing was committed)
 *
 * Every callback is also written to payment_callbacks, after the payment transaction,
 * so failed and rejected callbacks leave an audit trail too.
 */
@Injectable()
export class PaymentCallbacksService {
  private readonly logger = new Logger(PaymentCallbacksService.name);

  constructor(
    private readonly payments: PaymentsService,
    @InjectRepository(PaymentCallback)
    private readonly callbacks: Repository<PaymentCallback>,
  ) {}

  async handle(
    dto: ProviderCallbackDto,
    requestId?: string,
  ): Promise<CallbackAckDto> {
    const entry: Partial<PaymentCallback> = {
      provider: dto.provider,
      transactionId: dto.transaction_id,
      reportedStatus: dto.status,
      payload: Object.fromEntries(Object.entries(dto)),
      requestId: requestId?.slice(0, 64) ?? null,
      outcome: CallbackOutcome.Error,
      httpStatus: 500,
      paymentId: null,
      detail: null,
    };

    try {
      const result = await this.payments.applyProviderResult({
        provider: dto.provider,
        transactionId: dto.transaction_id,
        status: dto.status,
        amount: dto.amount,
        currency: dto.currency,
        occurredAt: new Date(dto.timestamp),
        reason: dto.reason,
      });
      entry.outcome = result.outcome;
      entry.paymentId = 'payment' in result ? result.payment.id : null;

      const error = toHttpError(result);
      if (error) {
        throw error;
      }
      if (result.outcome === CallbackOutcome.Unmatched) {
        throw new Error('unreachable');
      }
      entry.httpStatus = 200;

      return {
        received: true,
        transactionId: dto.transaction_id,
        paymentStatus: result.payment.status,
        duplicate: result.outcome === CallbackOutcome.Duplicate,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        entry.httpStatus = error.getStatus();
        entry.detail = error.message.slice(0, 255);
      } else {
        // The transaction rolled back. A 500 makes the provider retry later.
        entry.detail = String(
          error instanceof Error ? error.message : error,
        ).slice(0, 255);
      }
      throw error;
    } finally {
      await this.audit(entry);
    }
  }

  /** Best effort: losing an audit row must not change the answer to the provider. */
  private async audit(entry: Partial<PaymentCallback>): Promise<void> {
    this.logger.log(
      `Callback ${entry.provider} ${entry.transactionId} reported ${entry.reportedStatus}: ` +
        `${entry.outcome} (HTTP ${entry.httpStatus})`,
    );
    try {
      await this.callbacks.save(this.callbacks.create(entry));
    } catch (error) {
      this.logger.error(
        `Could not record callback ${entry.provider} ${entry.transactionId} in payment_callbacks`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function toHttpError(result: ApplyResult): HttpException | undefined {
  switch (result.outcome) {
    case CallbackOutcome.Unmatched:
      return new NotFoundException(
        'Unknown transaction_id: no payment request matches it.',
      );
    case CallbackOutcome.Conflict:
      return new ConflictException(result.detail);
    case CallbackOutcome.Rejected:
      return new UnprocessableEntityException(result.detail);
    default:
      return undefined;
  }
}
