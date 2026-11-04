import { ApiProperty } from '@nestjs/swagger';
import { LoanStatus } from '../../loans/entities/loan.entity.js';

export class RepaymentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 20_000 })
  amount: number;

  @ApiProperty({ example: 'MOMO-001' })
  providerRef: string;

  @ApiProperty({ example: 35_000, description: 'Balance after this payment.' })
  loanOutstanding: number;

  @ApiProperty({
    enum: LoanStatus,
    enumName: 'LoanStatus',
    example: LoanStatus.Active,
    description: 'Becomes "closed" when the balance reaches 0.',
  })
  loanStatus: LoanStatus;
}
