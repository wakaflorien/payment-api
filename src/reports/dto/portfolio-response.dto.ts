import { ApiProperty } from '@nestjs/swagger';

export class PortfolioResponseDto {
  @ApiProperty({ example: 1, description: 'Number of active loans.' })
  activeLoans: number;

  @ApiProperty({
    example: 100_000,
    description: 'Sum of outstanding balances on active loans, in RWF.',
  })
  totalOutstanding: number;

  @ApiProperty({
    example: 65_000,
    description: 'Sum of all repayments ever recorded, in RWF.',
  })
  totalRepaid: number;
}
