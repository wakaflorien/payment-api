import { ApiProperty } from '@nestjs/swagger';
import { Payment } from '../entities/payment.entity.js';
import { PaymentProvider, PaymentStatus } from '../payment.enums.js';

/** A payment as the staff front end (Next.js) sees it. camelCase, ISO dates. */
export class PaymentResponseDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 3 })
  loanId: number;

  @ApiProperty({ enum: PaymentProvider, example: PaymentProvider.Mtn })
  provider: PaymentProvider;

  @ApiProperty({ example: 'MTN-0b7f1c1e-4f2a-4bd5-9d38-2f4d1c9a8e10' })
  transactionId: string;

  @ApiProperty({ example: 20_000, description: 'Whole RWF.' })
  amount: number;

  @ApiProperty({
    example: 20_000,
    description: 'The part that reduced the loan balance.',
  })
  appliedAmount: number;

  @ApiProperty({
    example: 0,
    description:
      'Received but not applied because the loan was already cleared. To be refunded.',
  })
  unappliedAmount: number;

  @ApiProperty({ example: 'RWF' })
  currency: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.Pending })
  status: PaymentStatus;

  @ApiProperty({ example: '0788123456', nullable: true, type: String })
  payerPhone: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  failureReason: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    example: '2026-10-30T10:30:00.000Z',
    description: 'When the provider says the payment happened.',
  })
  providerTimestamp: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    example: null,
    description: 'When we recorded SUCCESS or FAILED.',
  })
  completedAt: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-30T10:29:12.000Z' })
  createdAt: string;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 15 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedPaymentsDto {
  @ApiProperty({ type: [PaymentResponseDto] })
  data: PaymentResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export function toPaymentResponse(payment: Payment): PaymentResponseDto {
  return {
    id: payment.id,
    loanId: payment.loanId,
    provider: payment.provider,
    transactionId: payment.transactionId,
    amount: payment.amount,
    appliedAmount: payment.appliedAmount,
    unappliedAmount: payment.unappliedAmount,
    currency: payment.currency,
    status: payment.status,
    payerPhone: payment.payerPhone,
    failureReason: payment.failureReason,
    providerTimestamp: payment.providerTimestamp?.toISOString() ?? null,
    completedAt: payment.completedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}
