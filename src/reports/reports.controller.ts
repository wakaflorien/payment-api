import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ApiProtected } from '../common/api-docs.decorators.js';
import { Loan, LoanStatus } from '../loans/entities/loan.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PaymentStatus } from '../payments/payment.enums.js';
import { Role } from '../users/role.enum.js';
import { PortfolioResponseDto } from './dto/portfolio-response.dto.js';

@ApiTags('reports')
@ApiProtected()
@Controller('reports')
export class ReportsController {
  constructor(
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  /** SUM() comes back from MySQL as a string, or null when there are no rows. */
  @Get('portfolio')
  @Roles(Role.Admin, Role.Auditor)
  @ApiOperation({ summary: 'Portfolio totals for the dashboard' })
  @ApiOkResponse({ type: PortfolioResponseDto })
  async portfolio(): Promise<PortfolioResponseDto> {
    const [activeLoans, totalOutstanding, totalRepaid] = await Promise.all([
      this.loans.countBy({ status: LoanStatus.Active }),
      this.loans.sum('outstanding', { status: LoanStatus.Active }),
      // Only money that actually reduced a loan counts as repaid.
      this.payments.sum('appliedAmount', { status: PaymentStatus.Success }),
    ]);

    return {
      activeLoans,
      totalOutstanding: Number(totalOutstanding ?? 0),
      totalRepaid: Number(totalRepaid ?? 0),
    };
  }
}
