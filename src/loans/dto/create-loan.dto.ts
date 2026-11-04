import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Must not already have an active loan.',
  })
  @IsInt()
  @Min(1)
  customerId: number;

  /** Whole RWF. */
  @ApiProperty({
    example: 100_000,
    minimum: 10_000,
    maximum: 50_000_000,
    description: 'Whole RWF.',
  })
  @IsInt()
  @Min(10_000)
  @Max(50_000_000)
  principal: number;

  /** Flat percentage for the whole loan, e.g. 10 or 12.5. */
  @ApiProperty({
    example: 10,
    minimum: 0,
    maximum: 100,
    description:
      'Flat percentage for the whole loan (not per month), up to 2 decimals.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  interestRate: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  termMonths: number;
}
