import { ApiProperty } from '@nestjs/swagger';
import { LoanStatus } from '../entities/loan.entity.js';

export class InstallmentDto {
  @ApiProperty({ example: 1 })
  number: number;

  @ApiProperty({ format: 'date', example: '2026-12-04' })
  dueDate: string;

  @ApiProperty({ example: 36_667, description: 'Whole RWF.' })
  amount: number;
}

export class LoanPaymentDto {
  @ApiProperty({ example: 20_000, description: 'Whole RWF.' })
  amount: number;

  @ApiProperty({ example: 'MOMO-001' })
  providerRef: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-04T10:15:00.000Z' })
  paidAt: string;
}

export class LoanResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  customerId: number;

  @ApiProperty({ example: 100_000 })
  principal: number;

  @ApiProperty({ example: 10 })
  interestRate: number;

  @ApiProperty({
    example: 10_000,
    description: 'principal × interestRate / 100, rounded to whole francs.',
  })
  interestAmount: number;

  @ApiProperty({ example: 110_000 })
  totalDue: number;

  @ApiProperty({ example: 110_000, description: 'What is still owed.' })
  outstanding: number;

  @ApiProperty({ example: 3 })
  termMonths: number;

  @ApiProperty({
    enum: LoanStatus,
    enumName: 'LoanStatus',
    example: LoanStatus.Active,
  })
  status: LoanStatus;

  @ApiProperty({ format: 'date', example: '2026-11-04' })
  disbursedAt: string;

  @ApiProperty({
    type: [InstallmentDto],
    description:
      'totalDue split into whole amounts, larger first. Due n months after disbursedAt, clamped to month end.',
  })
  installments: InstallmentDto[];

  @ApiProperty({ type: [LoanPaymentDto], description: 'Oldest first.' })
  payments: LoanPaymentDto[];
}
