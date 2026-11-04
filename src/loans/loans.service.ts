import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { isDuplicateEntry } from '../common/is-duplicate-entry.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { PaymentStatus } from '../payments/payment.enums.js';
import { CreateLoanDto } from './dto/create-loan.dto.js';
import { InstallmentDto, LoanResponseDto } from './dto/loan-response.dto.js';
import { Installment } from './entities/installment.entity.js';
import {
  Loan,
  LoanStatus,
  ONE_ACTIVE_LOAN_PER_CUSTOMER,
} from './entities/loan.entity.js';
import {
  addMonthsNoOverflow,
  flatInterest,
  splitAmount,
  today,
} from './loan-schedule.js';

@Injectable()
export class LoansService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
  ) {}

  /**
   * Disburse a loan. Two layers stop a customer from getting two active loans:
   * - The customer row is locked (SELECT ... FOR UPDATE), so simultaneous
   *   disbursements for the same customer run one after another and the
   *   "has an active loan?" check can't be raced.
   * - The UNIQUE index on loans.active_customer_id is the database-level
   *   guarantee. If it ever fires, it is reported as the same 409.
   */
  async create(dto: CreateLoanDto): Promise<LoanResponseDto> {
    let loanId: number;
    try {
      loanId = await this.disburseInTransaction(dto);
    } catch (error) {
      if (isDuplicateEntry(error, ONE_ACTIVE_LOAN_PER_CUSTOMER)) {
        throw activeLoanConflict();
      }
      throw error;
    }

    return this.findOne(loanId);
  }

  private disburseInTransaction(dto: CreateLoanDto): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found.');
      }

      const hasActiveLoan = await manager.existsBy(Loan, {
        customerId: customer.id,
        status: LoanStatus.Active,
      });
      if (hasActiveLoan) {
        throw activeLoanConflict();
      }

      const interestAmount = flatInterest(dto.principal, dto.interestRate);
      const totalDue = dto.principal + interestAmount;
      const disbursedAt = today();

      const loan = manager.create(Loan, {
        customerId: customer.id,
        principal: dto.principal,
        interestRate: dto.interestRate,
        interestAmount,
        totalDue,
        outstanding: totalDue,
        termMonths: dto.termMonths,
        status: LoanStatus.Active,
        disbursedAt,
        installments: splitAmount(totalDue, dto.termMonths).map(
          (amount, index) =>
            manager.create(Installment, {
              number: index + 1,
              dueDate: addMonthsNoOverflow(disbursedAt, index + 1),
              amount,
            }),
        ),
      });

      return (await manager.save(loan)).id;
    });
  }

  async findOne(id: number): Promise<LoanResponseDto> {
    const loan = await this.loans.findOne({
      where: { id },
      relations: { installments: true, payments: true },
      order: { installments: { number: 'ASC' }, payments: { id: 'ASC' } },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found.');
    }

    return toLoanResponse(loan);
  }
}

function toLoanResponse(loan: Loan): LoanResponseDto {
  return {
    id: loan.id,
    customerId: loan.customerId,
    principal: loan.principal,
    interestRate: loan.interestRate,
    interestAmount: loan.interestAmount,
    totalDue: loan.totalDue,
    outstanding: loan.outstanding,
    termMonths: loan.termMonths,
    status: loan.status,
    disbursedAt: loan.disbursedAt,
    installments: loan.installments.map(({ number, dueDate, amount }) => ({
      number,
      dueDate,
      amount,
    })),
    // Only confirmed money. Pending and failed attempts are listed by GET /loans/:id/payments.
    payments: loan.payments
      .filter((payment) => payment.status === PaymentStatus.Success)
      .map(({ amount, transactionId, completedAt, createdAt }) => ({
        amount,
        providerRef: transactionId,
        paidAt: (completedAt ?? createdAt).toISOString(),
      })),
  };
}

function activeLoanConflict(): ConflictException {
  return new ConflictException('This customer already has an active loan.');
}
