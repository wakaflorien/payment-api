import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from '../loans/entities/loan.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Payment])],
  controllers: [ReportsController],
})
export class ReportsModule {}
