import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { ApiValidationErrorResponse } from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import {
  CallbackAckDto,
  ProviderCallbackDto,
} from './dto/provider-callback.dto.js';
import { ProviderAuthGuard } from './guards/provider-auth.guard.js';
import { PaymentCallbacksService } from './payment-callbacks.service.js';

export const PROVIDER_AUTH = 'provider-token';

@ApiTags('provider callbacks')
@Controller('payments/callbacks')
export class PaymentCallbacksController {
  constructor(private readonly callbacks: PaymentCallbacksService) {}

  /** @Public skips the staff JWT guard; ProviderAuthGuard authenticates the provider instead. */
  @Post()
  @Public()
  @UseGuards(ProviderAuthGuard)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Payment result callback from MTN / Airtel',
    description:
      'Called by the payment provider, not by staff. Authenticated with the provider token **and** an ' +
      'HMAC-SHA256 signature of `"<X-Timestamp>.<raw body>"`.\n\n' +
      'Idempotent: the same callback can arrive any number of times and is applied once. ' +
      'The payment status and the loan balance change in one database transaction.\n\n' +
      'Retry contract: 2xx = stop retrying, 4xx = never succeeds, 5xx = retry later.',
  })
  @ApiBearerAuth(PROVIDER_AUTH)
  @ApiHeader({
    name: 'X-Timestamp',
    required: true,
    description:
      'Unix time in seconds when the request was sent. Must be within 5 minutes of our clock.',
    example: '1793356200',
  })
  @ApiHeader({
    name: 'X-Signature',
    required: true,
    description:
      'sha256=<hex HMAC-SHA256 of "<X-Timestamp>.<raw request body>" with the provider\'s callback secret>',
    example:
      'sha256=5d41402abc4b2a76b9719d911017c592ae2b7f7c1f3e9b1f4a3c0e2d1b0a9f8e',
  })
  @ApiBody({
    type: ProviderCallbackDto,
    examples: {
      success: {
        summary: 'Successful payment (the example from the brief)',
        value: {
          provider: 'MTN',
          transaction_id: 'MTNN848',
          amount: '43433434',
          currency: 'RWF',
          status: 'SUCCESS',
          timestamp: '2026-10-30T10:30:00Z',
        },
      },
      failed: {
        summary: 'Failed payment',
        value: {
          provider: 'AIRTEL',
          transaction_id: '0b7f1c1e-4f2a-4bd5-9d38-2f4d1c9a8e10',
          amount: 20000,
          currency: 'RWF',
          status: 'FAILED',
          timestamp: '2026-10-30T10:31:00Z',
          reason: 'Payer has insufficient funds',
        },
      },
    },
  })
  @ApiOkResponse({
    type: CallbackAckDto,
    description: 'Recorded (or already recorded: `duplicate: true`).',
  })
  @ApiValidationErrorResponse()
  @ApiUnauthorizedResponse({
    description: 'Bad token, bad signature or stale X-Timestamp.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No payment request has this transaction_id.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'The payment already has a different final status (e.g. FAILED after SUCCESS).',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Amount or currency differs from the payment request.',
    type: ErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description:
      'Nothing was committed (e.g. the database failed). The provider should retry.',
    type: ErrorResponseDto,
  })
  handle(
    @Body() dto: ProviderCallbackDto,
    @Req() request: Request,
  ): Promise<CallbackAckDto> {
    return this.callbacks.handle(dto, request.header('x-request-id'));
  }
}
