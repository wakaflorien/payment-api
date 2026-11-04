import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { Loan } from './loan.entity.js';

@Entity('installments')
@Unique(['loanId', 'number'])
export class Installment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'loan_id', type: 'int' })
  loanId: number;

  @ManyToOne(() => Loan, (loan) => loan.installments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loan_id' })
  loan: Relation<Loan>;

  @Column({ type: 'tinyint', unsigned: true })
  number: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'int', unsigned: true })
  amount: number;
}
