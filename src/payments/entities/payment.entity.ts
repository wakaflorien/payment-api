import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Loan } from '../../loans/entities/loan.entity.js';
import { PaymentProvider, PaymentStatus } from '../payment.enums.js';

/** UNIQUE index that makes a provider transaction impossible to store twice. */
export const PAYMENT_PROVIDER_TRANSACTION = 'uq_payments_provider_transaction';

/**
 * The payment ledger: one row per attempt to collect money for a loan, whatever the channel.
 *
 * Amounts are whole RWF in INT UNSIGNED (RWF has no minor unit; mysql2 returns
 * BIGINT/DECIMAL as strings). `amount = appliedAmount + unappliedAmount` once SUCCESS.
 * Rows are never deleted: a FAILED payment stays as evidence of the attempt.
 */
@Entity('payments')
@Unique(PAYMENT_PROVIDER_TRANSACTION, ['provider', 'transactionId'])
@Index('idx_payments_loan_status', ['loanId', 'status'])
@Index('idx_payments_reconcile', ['status', 'nextReconcileAt'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'loan_id', type: 'int' })
  loanId: number;

  @ManyToOne(() => Loan, (loan) => loan.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loan_id' })
  loan: Relation<Loan>;

  @Column({ type: 'varchar', length: 20 })
  provider: PaymentProvider;

  /**
   * Our reference for this payment, sent to the provider as its idempotency key
   * (MTN X-Reference-Id, Airtel transaction.id) and echoed back in callbacks.
   * For MANUAL payments it is the officer-entered providerRef.
   */
  @Column({ name: 'transaction_id', type: 'varchar', length: 100 })
  transactionId: string;

  @Column({ type: 'int', unsigned: true })
  amount: number;

  /** The part of `amount` that reduced the loan balance. */
  @Column({ name: 'applied_amount', type: 'int', unsigned: true, default: 0 })
  appliedAmount: number;

  /**
   * Money we received but could not apply, because a concurrent payment already
   * cleared the loan. Kept for a refund instead of being silently lost.
   */
  @Column({ name: 'unapplied_amount', type: 'int', unsigned: true, default: 0 })
  unappliedAmount: number;

  @Column({ type: 'char', length: 3, default: 'RWF' })
  currency: string;

  @Column({ type: 'varchar', length: 10, default: PaymentStatus.Pending })
  status: PaymentStatus;

  @Column({ name: 'payer_phone', type: 'varchar', length: 15, nullable: true })
  payerPhone: string | null;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  failureReason: string | null;

  /** When the provider says the payment happened (the callback's `timestamp`). */
  @Column({ name: 'provider_timestamp', type: 'datetime', nullable: true })
  providerTimestamp: Date | null;

  /** When we recorded the final status (SUCCESS or FAILED). */
  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  /** How many times the reconciliation job asked the provider about this PENDING payment. */
  @Column({
    name: 'reconcile_attempts',
    type: 'smallint',
    unsigned: true,
    default: 0,
  })
  reconcileAttempts: number;

  /** When the reconciliation job may next ask the provider. NULL once final. */
  @Column({ name: 'next_reconcile_at', type: 'datetime', nullable: true })
  nextReconcileAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
