import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CURRENCY,
  MAX_AMOUNT,
  MOBILE_MONEY_PROVIDERS,
  type MobileMoneyProvider,
  PaymentStatus,
} from '../payment.enums.js';

/**
 * The normalized callback a provider sends us. Field names are snake_case
 * because this is the provider's contract, not our camelCase API.
 */
export class ProviderCallbackDto {
  @ApiProperty({ enum: MOBILE_MONEY_PROVIDERS, example: 'MTN' })
  @IsIn(MOBILE_MONEY_PROVIDERS)
  provider: MobileMoneyProvider;

  @ApiProperty({
    example: 'MTNN848',
    maxLength: 100,
    pattern: '^[A-Za-z0-9_-]{1,100}$',
    description:
      'The transaction id we sent with the payment request (returned by POST /loans/:loanId/payment-requests).',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,100}$/, {
    message:
      'transaction_id must be 1-100 letters, digits, hyphens or underscores',
  })
  transaction_id: string;

  /**
   * Providers often send amounts as strings. Accept a string of digits or an integer,
   * nothing else: RWF has no minor unit, so "100.50" is invalid, not rounded.
   */
  @ApiProperty({
    oneOf: [
      { type: 'string', pattern: '^\\d+$' },
      { type: 'integer', minimum: 1 },
    ],
    example: '43433434',
    description: 'Whole RWF, as a string of digits or an integer.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d{1,10}$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt({ message: 'amount must be a whole number of RWF' })
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ enum: [CURRENCY], example: CURRENCY })
  @IsIn([CURRENCY])
  currency: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.Success })
  @IsIn(Object.values(PaymentStatus))
  status: PaymentStatus;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-30T10:30:00Z',
    description:
      'When the payment happened at the provider. May be old (late callback); replay protection uses X-Timestamp instead.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'timestamp must include a time and a time zone',
  })
  timestamp: string;

  @ApiPropertyOptional({
    example: 'Payer has insufficient funds',
    maxLength: 255,
    description: 'Why the payment failed. Only meaningful with status FAILED.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class CallbackAckDto {
  @ApiProperty({ example: true })
  received: boolean;

  @ApiProperty({ example: 'MTNN848' })
  transactionId: string;

  @ApiProperty({
    enum: PaymentStatus,
    example: PaymentStatus.Success,
    description: 'Our status for this payment after processing the callback.',
  })
  paymentStatus: PaymentStatus;

  @ApiProperty({
    example: false,
    description:
      'True when this callback repeated a final status we had already recorded. Nothing changed.',
  })
  duplicate: boolean;
}
