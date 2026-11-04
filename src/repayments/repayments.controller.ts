import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
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
import { CreateRepaymentDto } from './dto/create-repayment.dto.js';
import { RepaymentResponseDto } from './dto/repayment-response.dto.js';
import { RepaymentsService } from './repayments.service.js';

@ApiTags('repayments')
@ApiProtected()
@Controller('loans/:loanId/repayments')
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  @Roles(Role.Admin, Role.LoanOfficer)
  @ApiOperation({
    summary: 'Record a mobile money repayment',
    description:
      'Idempotent per providerRef and safe under concurrent callbacks: the loan row is locked ' +
      '(SELECT ... FOR UPDATE) while the balance is checked and reduced. ' +
      'The loan closes when the balance reaches 0.',
  })
  @ApiParam({ name: 'loanId', type: Number, example: 1 })
  @ApiCreatedResponse({ type: RepaymentResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse({
    description: 'Loan not found.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'This providerRef has already been recorded. Nothing changed.',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The amount exceeds the outstanding balance, or the loan is not active.',
    type: ErrorResponseDto,
  })
  create(
    @Param('loanId', ParseIntPipe) loanId: number,
    @Body() dto: CreateRepaymentDto,
  ): Promise<RepaymentResponseDto> {
    return this.repaymentsService.apply(loanId, dto);
  }
}
