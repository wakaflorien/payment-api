import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isDuplicateEntry } from '../common/is-duplicate-entry.js';
import { Loan, LoanStatus } from '../loans/entities/loan.entity.js';
import { CreateRepaymentDto } from './dto/create-repayment.dto.js';
import { RepaymentResponseDto } from './dto/repayment-response.dto.js';
import { Payment } from '../payments/entities/payment.entity.js';
import {
  CURRENCY,
  PaymentProvider,
  PaymentStatus,
} from '../payments/payment.enums.js';

@Injectable()
export class RepaymentsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Apply a mobile money payment to a loan.
   *
   * Safe under concurrency:
   * - SELECT ... FOR UPDATE on the loan row makes simultaneous payments for the
   *   same loan run one after another, so each one sees the real balance.
   * - The UNIQUE index on (provider, transaction_id) is the last line of defence against the
   *   same callback being stored twice, even across different loans.
   */
  async apply(
    loanId: number,
    dto: CreateRepaymentDto,
  ): Promise<RepaymentResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const loan = await manager.findOne(Loan, {
          where: { id: loanId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!loan) {
          throw new NotFoundException('Loan not found.');
        }

        if (
          await manager.existsBy(Payment, {
            provider: PaymentProvider.Manual,
            transactionId: dto.providerRef,
          })
        ) {
          throw duplicatePayment();
        }
        if (loan.status !== LoanStatus.Active) {
          throw new UnprocessableEntityException('This loan is not active.');
        }
        if (dto.amount > loan.outstanding) {
          throw new UnprocessableEntityException(
            `Amount exceeds the outstanding balance of ${loan.outstanding} RWF.`,
          );
        }

        loan.outstanding -= dto.amount;
        if (loan.outstanding === 0) {
          loan.status = LoanStatus.Closed;
        }
        await manager.save(loan);

        // An officer-recorded payment is already confirmed, so it is SUCCESS straight away.
        const payment = await manager.save(
          manager.create(Payment, {
            loanId: loan.id,
            provider: PaymentProvider.Manual,
            transactionId: dto.providerRef,
            amount: dto.amount,
            appliedAmount: dto.amount,
            unappliedAmount: 0,
            currency: CURRENCY,
            status: PaymentStatus.Success,
            completedAt: new Date(),
          }),
        );

        return {
          id: payment.id,
          amount: payment.amount,
          providerRef: payment.transactionId,
          loanOutstanding: loan.outstanding,
          loanStatus: loan.status,
        };
      });
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw duplicatePayment();
      }
      throw error;
    }
  }
}

function duplicatePayment(): ConflictException {
  return new ConflictException('This payment has already been recorded.');
}
