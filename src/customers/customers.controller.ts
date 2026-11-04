import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  ApiProtected,
  ApiValidationErrorResponse,
} from '../common/api-docs.decorators.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { Role } from '../users/role.enum.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import {
  CustomerResponseDto,
  PaginatedCustomersDto,
} from './dto/customer-response.dto.js';

@ApiTags('customers')
@ApiProtected()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(Role.Admin, Role.LoanOfficer)
  @ApiOperation({ summary: 'Register a customer' })
  @ApiCreatedResponse({ type: CustomerResponseDto })
  @ApiValidationErrorResponse()
  @ApiConflictResponse({
    description: 'The phone number or national ID is already registered.',
    type: ErrorResponseDto,
  })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    return this.customersService.create(dto);
  }

  @Get()
  @Roles(Role.Admin, Role.LoanOfficer, Role.Auditor)
  @ApiOperation({ summary: 'List customers, newest first, 15 per page' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: '1-based page number. Defaults to 1.',
  })
  @ApiOkResponse({ type: PaginatedCustomersDto })
  @ApiBadRequestResponse({
    description: '`page` is not a whole number.',
    type: ErrorResponseDto,
  })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<PaginatedCustomersDto> {
    return this.customersService.findAll(Math.max(page, 1));
  }
}
