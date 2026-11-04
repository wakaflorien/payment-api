import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateRepaymentDto {
  /** Whole RWF. */
  @ApiProperty({
    example: 20_000,
    minimum: 1,
    description: 'Whole RWF. Cannot exceed the loan’s outstanding balance.',
  })
  @IsInt()
  @Min(1)
  amount: number;

  /** Mobile money transaction ID, e.g. MTN MoMo's financialTransactionId. */
  @ApiProperty({
    example: 'MOMO-001',
    maxLength: 100,
    description:
      'Mobile money transaction ID. Unique: resending the same ref returns 409 and changes nothing.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  providerRef: string;
}
