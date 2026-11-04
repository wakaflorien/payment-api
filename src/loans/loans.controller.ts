import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ApiProtected,
  ApiValidationErrorResponse,
} from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { Role } from '../users/role.enum.js';
import { CreateLoanDto } from './dto/create-loan.dto.js';
import { LoanResponseDto } from './dto/loan-response.dto.js';
import { LoansService } from './loans.service.js';

@ApiTags('loans')
@ApiProtected()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @Roles(Role.Admin, Role.LoanOfficer)
  @ApiOperation({
    summary: 'Disburse a loan',
    description:
      'Computes flat interest, the total due and the installment schedule, and saves them in one transaction.',
  })
  @ApiCreatedResponse({ type: LoanResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse({
    description: 'Customer not found.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'The customer already has an active loan.',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateLoanDto): Promise<LoanResponseDto> {
    return this.loansService.create(dto);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.LoanOfficer, Role.Auditor)
  @ApiOperation({ summary: 'Show a loan with its installments and payments' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: LoanResponseDto })
  @ApiBadRequestResponse({
    description: '`id` is not a whole number.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Loan not found.',
    type: ErrorResponseDto,
  })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<LoanResponseDto> {
    return this.loansService.findOne(id);
  }
}
