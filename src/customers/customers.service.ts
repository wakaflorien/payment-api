import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isDuplicateEntry } from '../common/is-duplicate-entry.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import {
  CustomerResponseDto,
  PaginatedCustomersDto,
} from './dto/customer-response.dto.js';
import { Customer } from './entities/customer.entity.js';

export const CUSTOMERS_PER_PAGE = 15;

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    try {
      const customer = await this.customers.save(this.customers.create(dto));

      return toCustomerResponse(customer);
    } catch (error) {
      // The UNIQUE indexes are the source of truth, so there's no race between "check" and "insert".
      if (isDuplicateEntry(error)) {
        throw new ConflictException(
          'A customer with this phone or national ID already exists.',
        );
      }
      throw error;
    }
  }

  async findAll(page: number): Promise<PaginatedCustomersDto> {
    const [customers, total] = await this.customers.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * CUSTOMERS_PER_PAGE,
      take: CUSTOMERS_PER_PAGE,
    });

    return {
      data: customers.map(toCustomerResponse),
      meta: {
        page,
        limit: CUSTOMERS_PER_PAGE,
        total,
        totalPages: Math.ceil(total / CUSTOMERS_PER_PAGE),
      },
    };
  }
}

/** Explicit response shape, so internal columns like createdAt never leak. */
function toCustomerResponse(customer: Customer): CustomerResponseDto {
  return {
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    nationalId: customer.nationalId,
  };
}
