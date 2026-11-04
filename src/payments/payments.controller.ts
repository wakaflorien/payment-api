import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ApiProtected,
  ApiValidationErrorResponse,
} from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { Role } from '../users/role.enum.js';
import {
  CreatePaymentRequestDto,
  PaymentRequestResponseDto,
} from './dto/create-payment-request.dto.js';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';
import {
  PaginatedPaymentsDto,
  PaymentResponseDto,
  toPaymentResponse,
} from './dto/payment-response.dto.js';
import { PaymentReconciliationService } from './payment-reconciliation.service.js';
import { PaymentRequestsService } from './payment-requests.service.js';
import { PaymentsService } from './payments.service.js';

const ALL_STAFF = [Role.Admin, Role.LoanOfficer, Role.Auditor];

/** Read API for the staff front end, plus a manual "ask the provider now" button. */
@ApiTags('payments')
@ApiProtected()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly reconciliation: PaymentReconciliationService,
  ) {}

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({
    summary: 'List payments, newest first, 15 per page',
    description: 'Filter by status, provider and/or loan.',
  })
  @ApiOkResponse({ type: PaginatedPaymentsDto })
  @ApiValidationErrorResponse()
  findAll(@Query() query: ListPaymentsQueryDto): Promise<PaginatedPaymentsDto> {
    return this.payments.findAll(query);
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Show one payment' })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({
    description: 'Payment not found.',
    type: ErrorResponseDto,
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentResponseDto> {
    return toPaymentResponse(await this.payments.findOne(id));
  }

  @Post(':id/reconcile')
  @HttpCode(200)
  @Roles(Role.Admin)
  @ApiOperation({
    summary: 'Ask the provider for the status of a PENDING payment now',
    description:
      'Runs the same check as the background reconciliation job, for one payment. ' +
      'A payment that is already final is returned unchanged.',
  })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({
    description: 'Payment not found.',
    type: ErrorResponseDto,
  })
  async reconcile(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentResponseDto> {
    const payment = await this.payments.findOne(id);

    return toPaymentResponse(await this.reconciliation.reconcile(payment));
  }
}

/** Payment endpoints nested under a loan. */
@ApiTags('payments')
@ApiProtected()
@Controller('loans/:loanId')
export class LoanPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly paymentRequests: PaymentRequestsService,
  ) {}

  @Post('payment-requests')
  @HttpCode(202)
  @Roles(Role.Admin, Role.LoanOfficer)
  @ApiOperation({
    summary: 'Ask MTN / Airtel to collect a repayment from the customer',
    description:
      'Creates a PENDING payment, then asks the provider to prompt the customer on their phone. ' +
      'The loan balance only changes when the provider confirms (callback or reconciliation).\n\n' +
      'If the provider times out, the payment stays PENDING (`providerResponse: "UNKNOWN"`) and is never ' +
      'marked FAILED, because the customer may still approve it.',
  })
  @ApiParam({ name: 'loanId', type: Number, example: 1 })
  @ApiAcceptedResponse({ type: PaymentRequestResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse({
    description: 'Loan not found.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The loan is not active, or the amount exceeds the balance minus other pending requests.',
    type: ErrorResponseDto,
  })
  @ApiBadGatewayResponse({
    description: 'The provider refused the request. The payment is FAILED.',
    type: ErrorResponseDto,
  })
  requestPayment(
    @Param('loanId', ParseIntPipe) loanId: number,
    @Body() dto: CreatePaymentRequestDto,
  ): Promise<PaymentRequestResponseDto> {
    return this.paymentRequests.create(loanId, dto);
  }

  @Get('payments')
  @Roles(...ALL_STAFF)
  @ApiOperation({
    summary: "List a loan's payments, newest first, in every status",
  })
  @ApiParam({ name: 'loanId', type: Number, example: 1 })
  @ApiOkResponse({ type: [PaymentResponseDto] })
  @ApiNotFoundResponse({
    description: 'Loan not found.',
    type: ErrorResponseDto,
  })
  findByLoan(
    @Param('loanId', ParseIntPipe) loanId: number,
  ): Promise<PaymentResponseDto[]> {
    return this.payments.findByLoan(loanId);
  }
}
