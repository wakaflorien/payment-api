import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  /** UNIQUE index: the database, not a "check first" query, guarantees no duplicates. */
  @Column({ type: 'varchar', length: 10, unique: true })
  phone: string;

  @Column({ name: 'national_id', type: 'char', length: 16, unique: true })
  nationalId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
