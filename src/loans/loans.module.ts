import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Installment } from './entities/installment.entity.js';
import { Loan } from './entities/loan.entity.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Installment])],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
