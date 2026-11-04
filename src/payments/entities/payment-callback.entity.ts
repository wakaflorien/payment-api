import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CallbackOutcome } from '../payment.enums.js';

/**
 * Append-only log of every authenticated provider callback and what we did with it.
 *
 * It is written in its own statement *after* the payment transaction commits or
 * rolls back, so a callback whose processing failed still leaves a trace. It has no
 * foreign key on purpose: an UNMATCHED callback has no payment to point to.
 */
@Entity('payment_callbacks')
@Index('idx_payment_callbacks_transaction', ['provider', 'transactionId'])
export class PaymentCallback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  provider: string;

  @Column({ name: 'transaction_id', type: 'varchar', length: 100 })
  transactionId: string;

  /** The status the provider reported in this callback. */
  @Column({ name: 'reported_status', type: 'varchar', length: 10 })
  reportedStatus: string;

  @Column({ type: 'varchar', length: 20 })
  outcome: CallbackOutcome;

  @Column({ name: 'http_status', type: 'smallint', unsigned: true })
  httpStatus: number;

  @Column({ name: 'payment_id', type: 'int', nullable: true })
  paymentId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  detail: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  /** The validated callback body, as the provider sent it. */
  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
