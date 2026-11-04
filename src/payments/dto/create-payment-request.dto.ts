import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  MAX_AMOUNT,
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
} from '../payment.enums.js';
import { PaymentResponseDto } from './payment-response.dto.js';

/** Ask a customer to approve a repayment on their phone (MTN MoMo / Airtel Money "collection"). */
export class CreatePaymentRequestDto {
  @ApiProperty({ enum: MOBILE_MONEY_PROVIDERS, example: 'MTN' })
  @IsIn(MOBILE_MONEY_PROVIDERS)
  provider: MobileMoneyProvider;

  @ApiProperty({
    example: 20_000,
    minimum: 1,
    description:
      'Whole RWF. Cannot exceed the outstanding balance minus other pending requests.',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiPropertyOptional({
    example: '0788123456',
    pattern: '^07[2389]\\d{7}$',
    description: "The payer's mobile number. Defaults to the customer's phone.",
  })
  @IsOptional()
  @Matches(/^07[2389]\d{7}$/, {
    message: 'phone must be a Rwandan mobile number like 0788123456',
  })
  phone?: string;
}

export class PaymentRequestResponseDto extends PaymentResponseDto {
  @ApiProperty({
    enum: ['ACCEPTED', 'UNKNOWN'],
    example: 'ACCEPTED',
    description:
      'ACCEPTED: the provider took the request. UNKNOWN: it timed out or was unavailable, so the ' +
      'payment stays PENDING until a callback or the reconciliation job settles it.',
  })
  providerResponse: 'ACCEPTED' | 'UNKNOWN';
}
