import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { HealthModule } from './health/health.module.js';
import { LoansModule } from './loans/loans.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { RepaymentsModule } from './repayments/repayments.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // validateEnv fails the boot with a list of every missing or unsafe setting.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: Number(config.get('DB_PORT')),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        autoLoadEntities: true,
        // Local practice and tests only. Production uses the migrations below.
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
        migrations: [
          join(import.meta.dirname, 'database', 'migrations', '*.js'),
        ],
        migrationsRun: config.get('DB_MIGRATIONS_RUN') === 'true',
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    CustomersModule,
    LoansModule,
    RepaymentsModule,
    PaymentsModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
