import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity.js';
import { Payment } from '../../payments/entities/payment.entity.js';
import { Installment } from './installment.entity.js';

export enum LoanStatus {
  Active = 'active',
  Closed = 'closed',
}

/** Name of the UNIQUE index that allows at most one active loan per customer. */
export const ONE_ACTIVE_LOAN_PER_CUSTOMER = 'uq_loans_one_active_per_customer';

/**
 * Money is whole Rwandan francs (RWF has no minor unit), stored as unsigned INT.
 * INT rather than BIGINT because mysql2 returns BIGINT as a string, and the
 * largest loan (50M principal at 100% = 100M) fits comfortably under 4.29 billion.
 */
@Entity('loans')
@Index(ONE_ACTIVE_LOAN_PER_CUSTOMER, ['activeCustomerId'], { unique: true })
export class Loan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Relation<Customer>;

  @Column({ type: 'int', unsigned: true })
  principal: number;

  /** Flat percentage for the whole loan. DECIMAL comes back as a string, so convert it. */
  @Column({
    name: 'interest_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  interestRate: number;

  @Column({ name: 'interest_amount', type: 'int', unsigned: true })
  interestAmount: number;

  @Column({ name: 'total_due', type: 'int', unsigned: true })
  totalDue: number;

  @Column({ type: 'int', unsigned: true })
  outstanding: number;

  @Column({ name: 'term_months', type: 'tinyint', unsigned: true })
  termMonths: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: LoanStatus.Active })
  status: LoanStatus;

  /**
   * Database-level guard for "one active loan per customer". MySQL has no partial
   * unique index, so MySQL computes this column itself: the customer's id while the
   * loan is active, NULL once it closes. The UNIQUE index above allows any number
   * of NULLs, so closed loans never collide, but a second active loan for the same
   * customer is rejected even if some code path skips LoansService's row lock.
   */
  @Column({
    name: 'active_customer_id',
    type: 'int',
    nullable: true,
    generatedType: 'STORED',
    asExpression: `IF(\`status\` = '${LoanStatus.Active}', \`customer_id\`, NULL)`,
    insert: false,
    update: false,
    select: false,
  })
  activeCustomerId: number | null;

  /** DATE columns are returned as 'YYYY-MM-DD' strings, which avoids time zone shifts. */
  @Column({ name: 'disbursed_at', type: 'date' })
  disbursedAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Installment, (installment) => installment.loan, {
    cascade: ['insert'],
  })
  installments: Relation<Installment[]>;

  @OneToMany(() => Payment, (payment) => payment.loan)
  payments: Relation<Payment[]>;
}
