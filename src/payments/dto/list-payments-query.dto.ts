import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaymentProvider, PaymentStatus } from '../payment.enums.js';

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional()
  @IsIn(Object.values(PaymentProvider))
  provider?: PaymentProvider;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loanId?: number;
}
