import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity.js';
import { RepaymentsController } from './repayments.controller.js';
import { RepaymentsService } from './repayments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [RepaymentsController],
  providers: [RepaymentsService],
})
export class RepaymentsModule {}
